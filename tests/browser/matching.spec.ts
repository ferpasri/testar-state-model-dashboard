import { openModelSetup } from "./model-controls";
import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { MatchingDefinition, MatchingPreview } from "../../src/analysis";
import type { EvidenceEvent } from "../../src/evidence/schema";
import { sharedCases } from "../support";

const initial = sharedCases().find(
    (directory) => path.basename(directory) === "initial-observation",
)!;

function sourceVariant(
    info: TestInfo,
    name: string,
    url: string,
    title = "Original " + name,
): string {
    const directory = info.outputPath(name);
    mkdirSync(directory, { recursive: true });
    writeFileSync(
        path.join(directory, "manifest.json"),
        readFileSync(path.join(initial, "manifest.json")),
    );
    const entries: EvidenceEvent[] = readFileSync(path.join(initial, "evidence.jsonl"), "utf8")
        .trimEnd()
        .split("\n")
        .map((line) => JSON.parse(line));
    for (const { event } of entries) {
        if (event.event_type === "test_run_started") {
            event.data.producer = name;
        }
        if (event.event_type === "observation_recorded") {
            event.data.recorded_state.properties["ui.url"] = url;
            event.data.recorded_state.properties["ui.title"] = title;
            event.data.artifacts = [];
        }
    }
    // Keep record identities equal so the comparison must retain their source scope.
    writeFileSync(
        path.join(directory, "evidence.jsonl"),
        entries.map((entry) => JSON.stringify(entry)).join("\n") + "\n",
    );
    return directory;
}

async function importSources(
    page: Page,
    directories: string[],
    preset: string | null = "Page address",
): Promise<void> {
    await page.goto("/");
    for (const [index, directory] of directories.entries()) {
        await page.getByLabel("Evidence directory").setInputFiles(directory);
        await expect(page.locator(".source")).toHaveCount(index + 1);
    }
    await page.getByRole("button", { name: "Construct model", exact: true }).click();
    await expect(
        page.getByRole("heading", { name: "Match evidence across runs", exact: true }),
    ).toBeVisible();
    if (preset) {
        await page.getByLabel("Matching preset", { exact: true }).selectOption({ label: preset });
    }
}

async function previewMatches(page: Page): Promise<void> {
    await openModelSetup(page);
    await page.getByRole("button", { name: "Build model", exact: true }).click();
    await page.getByRole("button", { name: "Matching groups", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Proposed groups", exact: true })).toBeVisible();
}

async function editRules(page: Page, definition: unknown): Promise<void> {
    await openModelSetup(page);
    const editor = page.getByLabel("Matching definition", { exact: true });
    if (!(await editor.isVisible())) {
        await openModelSetup(page);
        await page.getByText("Edit matching rules (JSON)", { exact: true }).click();
    }
    await editor.fill(JSON.stringify(definition, null, 4));
}

async function downloadJson<T>(page: Page, button: string, filename: string): Promise<T> {
    if (button === "Download rules") {
        await openModelSetup(page);
    }
    const pendingDownload = page.waitForEvent("download");
    await page.getByRole("button", { name: button, exact: true }).click();
    const download = await pendingDownload;
    expect(download.suggestedFilename()).toBe(filename);
    const downloadedPath = await download.path();
    expect(downloadedPath).not.toBeNull();
    return JSON.parse(readFileSync(downloadedPath!, "utf8")) as T;
}

test("matches observations across sources without merging their identities", async ({
    page,
}, info) => {
    const url = "https://sut.example/account?id=7";
    await importSources(page, [
        sourceVariant(info, "source-a-tool", url),
        sourceVariant(info, "source-b-tool", url),
    ]);
    await previewMatches(page);
    await expect(page.locator(".match-group")).toHaveCount(1);
    await page.locator(".match-group").first().click();
    await expect(page.getByRole("heading", { name: "Group members", exact: true })).toBeVisible();
    await expect(page.locator(".match-member")).toHaveCount(2);
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
    );
    const secondMember = page.locator(".match-member").filter({ hasText: "source-b-tool" });
    await expect(secondMember).toHaveCount(1);
    await secondMember.getByRole("button", { name: /^Open original observation/u }).click();
    await expect(page.getByRole("heading", { name: "source-b-tool", exact: true })).toBeVisible();
    await expect(page.locator(".details .detail-title")).toContainText("Original source-b-tool");
    await expect(page.locator(".run.active")).toContainText("source-b-tool");
    await expect(page.locator(".source")).toHaveCount(2);
});

test("normalizes only explicitly selected data and invalidates previews when inputs change", async ({
    page,
}, info) => {
    await importSources(page, [
        sourceVariant(info, "source-a-tool", "https://sut.example/account?id=7&timestamp=1"),
        sourceVariant(info, "source-b-tool", "https://sut.example/account?id=7&timestamp=2"),
    ]);
    await previewMatches(page);
    await expect(page.locator(".match-group")).toHaveCount(0);
    await page.getByLabel("Group filter", { exact: true }).selectOption("all");
    await expect(page.locator(".match-group")).toHaveCount(2);
    const definition: MatchingDefinition = {
        version: 1,
        name: "Ignore the captured request timestamp",
        state: [
            {
                name: "Page",
                keys: ["ui.url"],
                required: true,
                transforms: [{ op: "url", remove_query: ["timestamp"] }],
            },
        ],
        capture: "same",
    };
    await editRules(page, definition);
    await expect(page.locator(".match-group")).toHaveCount(0);
    await previewMatches(page);
    await page.getByLabel("Group filter", { exact: true }).selectOption("cross-run");
    await expect(page.locator(".match-group")).toHaveCount(1);
    await page.locator(".match-group").first().click();
    await expect(page.locator(".match-member")).toHaveCount(2);
    const downloadedRules = await downloadJson<MatchingDefinition>(
        page,
        "Download rules",
        "matching-rules.json",
    );
    expect(downloadedRules).toEqual(definition);
    const downloadedPreview = await downloadJson<MatchingPreview>(
        page,
        "Download preview",
        "matching-preview.json",
    );
    expect(downloadedPreview.definition).toEqual(definition);
    expect(downloadedPreview.policyFingerprint).toMatch(/^[a-f0-9]{64}$/u);
    expect(downloadedPreview.interpreterVersion).toMatch(/^\d+\.\d+\.\d+$/u);
    expect(downloadedPreview.inputScope.sources).toHaveLength(2);
    for (const source of downloadedPreview.inputScope.sources) {
        expect(source.fingerprint).toMatch(/^[a-f0-9]{64}$/u);
    }
    expect(downloadedPreview.groups).toHaveLength(1);
    const references = downloadedPreview.groups[0].members.map((member) => member.reference);
    expect(new Set(references.map((reference) => reference.source)).size).toBe(2);
    expect(new Set(references.map((reference) => reference.run)).size).toBe(1);
    expect(new Set(references.map((reference) => reference.observation)).size).toBe(1);
    expect(new Set(references.map((reference) => reference.source))).toEqual(
        new Set(downloadedPreview.inputScope.sources.map((source) => source.id)),
    );
    await page
        .locator(".match-member")
        .filter({ hasText: "source-b-tool" })
        .getByRole("button", { name: "Open original observation", exact: true })
        .click();
    await expect(page.locator(".details .detail-title")).toContainText("Original source-b-tool");
    await page.getByRole("button", { name: "Construct model", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Proposed groups", exact: true })).toBeVisible();
    expect(
        JSON.parse(await page.getByLabel("Matching definition", { exact: true }).inputValue()),
    ).toEqual(definition);
    await expect(page.locator(".match-group")).toHaveCount(1);
    await expect(page.locator(".match-member")).toHaveCount(2);
    await openModelSetup(page);
    const secondRun = page.locator(".matching-run").filter({ hasText: "source-b-tool" });
    await secondRun.getByRole("checkbox").uncheck();
    await expect(page.locator(".match-group")).toHaveCount(0);
    await previewMatches(page);
    await expect(page.locator(".match-group")).toHaveCount(0);
    await expect(page.locator(".source")).toHaveCount(2);
});

test("reports invalid matching rules while preserving the imported evidence", async ({
    page,
}, info) => {
    const url = "https://sut.example/account";
    await importSources(page, [
        sourceVariant(info, "source-a-tool", url),
        sourceVariant(info, "source-b-tool", url),
    ]);
    await previewMatches(page);
    await expect(page.locator(".match-group")).toHaveCount(1);
    await editRules(page, {
        version: 99,
        name: "Unsupported rules",
        state: [{ name: "Page", keys: ["ui.url"] }],
        capture: "same",
    });
    await expect(page.locator(".match-group")).toHaveCount(0);
    await page.getByRole("button", { name: "Build model", exact: true }).click();
    await expect(page.getByRole("alert")).toContainText(/version/iu);
    await expect(page.locator(".source")).toHaveCount(2);
    await page.getByRole("button", { name: "Trace inspection", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Observation 1", exact: true })).toBeVisible();
    await expect(page.locator(".details .detail-title")).toContainText("Original source-b-tool");
});

test("uses title-aware defaults and configurable session normalization without changing captured addresses", async ({
    page,
}, info) => {
    const title = "Shared account";
    const firstAddress = "https://sut.example/account;session=one?account=7";
    const secondAddress = "https://sut.example/account;session=two?account=7";
    await importSources(
        page,
        [
            sourceVariant(info, "source-a-tool", firstAddress, title),
            sourceVariant(info, "source-b-tool", secondAddress, title),
        ],
        null,
    );
    const preset = page.getByLabel("Matching preset", { exact: true });
    await expect(preset.locator("option:checked")).toHaveText("Page address and title");
    await previewMatches(page);
    await expect(page.locator(".match-group")).toHaveCount(0);
    await openModelSetup(page);
    await page.getByText("Edit matching rules (JSON)", { exact: true }).click();
    const editor = page.getByLabel("Matching definition", { exact: true });
    const definition = JSON.parse(await editor.inputValue()) as MatchingDefinition;
    expect(definition.state.find((field) => field.keys.includes("ui.title"))?.required).toBe(true);
    const address = definition.state.find((field) => field.keys.includes("ui.url"))!;
    address.transforms = [
        { op: "url", remove_path_parameters: ["session"], remove_fragment: true },
    ];
    await editRules(page, definition);
    await previewMatches(page);
    await expect(page.locator(".match-group")).toHaveCount(1);
    await expect(page.locator(".match-member")).toHaveCount(2);
    await expect(page.locator(".match-member").filter({ hasText: "source-a-tool" })).toContainText(
        firstAddress,
    );
    await expect(page.locator(".match-member").filter({ hasText: "source-b-tool" })).toContainText(
        secondAddress,
    );
    await openModelSetup(page);
    const exported = await downloadJson<MatchingDefinition>(
        page,
        "Download rules",
        "matching-rules.json",
    );
    expect(exported.state.find((field) => field.name === "address")?.transforms).toEqual(
        address.transforms,
    );
    await page.getByRole("button", { name: "Derived model", exact: true }).click();
    await expect(
        page.getByRole("heading", { name: "Derived state model", exact: true }),
    ).toBeVisible();
    await expect(page.locator(".derived-node")).toHaveCount(1);
    await expect(page.locator(".derived-node")).toContainText(title);
    await expect(page.locator(".derived-selection-label")).toContainText(title);
    await page
        .locator(".derived-member")
        .filter({ hasText: "source-b-tool" })
        .getByRole("button", { name: "Open original observation", exact: true })
        .click();
    await page.getByRole("button", { name: "Observation", exact: true }).click();
    await expect(page.locator(".details")).toContainText(secondAddress);
});
