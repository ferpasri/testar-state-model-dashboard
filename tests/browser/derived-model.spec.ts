import { openRenderingOptions } from "./model-controls";
import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { DerivedModel, MatchingPreview } from "../../src/analysis";
import type { EvidenceEvent } from "../../src/evidence/schema";
import { sharedCases } from "../support";

const broader = sharedCases().find(
    (directory) => path.basename(directory) === "broader-oracle-targets",
)!;

function sourceVariant(
    info: TestInfo,
    name: string,
    options: { gap?: boolean; selfLoop?: boolean } = {},
): string {
    const directory = info.outputPath(name);
    mkdirSync(directory, { recursive: true });
    writeFileSync(
        path.join(directory, "manifest.json"),
        readFileSync(path.join(broader, "manifest.json")),
    );
    const entries: EvidenceEvent[] = readFileSync(path.join(broader, "evidence.jsonl"), "utf8")
        .trimEnd()
        .split("\n")
        .map((line) => JSON.parse(line));
    for (const { event } of entries) {
        if (event.event_type === "test_run_started") {
            event.data.producer = name;
        }
        if (event.event_type === "observation_recorded") {
            event.data.recorded_state.properties["ui.url"] =
                "https://sut.example/page/" + (options.selfLoop ? 1 : event.data.observation_index);
            event.data.artifacts = [];
        }
    }
    if (options.gap) {
        const observations = entries.flatMap(({ event }) =>
            event.event_type === "observation_recorded" ? [event.data] : [],
        );
        const following = structuredClone(observations[1]);
        following.id = "browser:observation:3";
        following.observation_index = 3;
        following.timestamp_micros = 3000;
        following.recorded_state.id = "browser:snapshot:3";
        following.recorded_state.properties["ui.title"] = "Step 3";
        following.recorded_state.properties["ui.url"] = "https://sut.example/page/3";
        const entry: EvidenceEvent = {
            schema_version: 3,
            id: "browser:event:observation:3",
            event: { event_type: "observation_recorded", data: following },
        };
        const finished = entries.findIndex(
            ({ event }) => event.event_type === "test_sequence_finished",
        );
        // This visit has no recorded execution connecting it to the previous visit.
        entries.splice(finished, 0, entry);
    }
    writeFileSync(
        path.join(directory, "evidence.jsonl"),
        entries.map((entry) => JSON.stringify(entry)).join("\n") + "\n",
    );
    return directory;
}

async function openDerivedModel(page: Page, directories: string[]): Promise<void> {
    await page.goto("/");
    for (const [index, directory] of directories.entries()) {
        await page.getByLabel("Evidence directory").setInputFiles(directory);
        await expect(page.locator(".source")).toHaveCount(index + 1);
    }
    await page.getByRole("button", { name: "Construct model", exact: true }).click();
    await page
        .getByLabel("Matching preset", { exact: true })
        .selectOption({ label: "Page address" });
    await page.getByRole("button", { name: "Build model", exact: true }).click();
    await expect(
        page.getByRole("heading", { name: "Derived state model", exact: true }),
    ).toBeVisible();
    await expect(
        page.getByRole("heading", { name: "Derived state model", exact: true }),
    ).toBeVisible();
    await expect(
        page
            .getByRole("region", { name: "Derived model graph", exact: true })
            .locator("canvas")
            .first(),
    ).toBeVisible();
    await page
        .getByRole("checkbox", { name: "Show observation-order links", exact: true })
        .uncheck();
}

test("combines recorded transitions while preserving source-scoped execution and observation navigation", async ({
    page,
}, info) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await openDerivedModel(page, [
        sourceVariant(info, "source-a-tool", { gap: true }),
        sourceVariant(info, "source-b-tool", { gap: true }),
    ]);
    await expect(page.locator(".derived-node")).toHaveCount(3);
    const pendingDownload = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download model", exact: true }).click();
    const download = await pendingDownload;
    expect(download.suggestedFilename()).toBe("derived-model.json");
    const downloadedPath = await download.path();
    expect(downloadedPath).not.toBeNull();
    const downloaded = JSON.parse(readFileSync(downloadedPath!, "utf8")) as Pick<
        MatchingPreview,
        "definition" | "policyFingerprint" | "interpreterVersion" | "inputScope"
    > & { model: DerivedModel };
    expect(downloaded.definition.version).toBe(1);
    expect(downloaded.definition.state.length).toBeGreaterThan(0);
    expect(downloaded.policyFingerprint).toMatch(/^[a-f0-9]{64}$/u);
    expect(downloaded.interpreterVersion).toMatch(/^\d+\.\d+\.\d+$/u);
    expect(downloaded.inputScope.sources).toHaveLength(2);
    expect(downloaded.inputScope.runs).toHaveLength(2);
    expect(downloaded.model.nodes).toHaveLength(3);
    expect(downloaded.model.counts).toMatchObject({
        observations: 6,
        executionEdges: 1,
        completedExecutions: 2,
        orderEdges: 1,
        orderLinks: 2,
        unlinkedExecutions: 0,
    });
    const executionReferences = downloaded.model.edges
        .filter((edge) => edge.kind === "execution")
        .flatMap((edge) => edge.executions);
    expect(executionReferences).toHaveLength(2);
    expect(new Set(executionReferences.map((reference) => reference.execution)).size).toBe(1);
    expect(new Set(executionReferences.map((reference) => reference.source))).toEqual(
        new Set(downloaded.inputScope.sources.map((source) => source.id)),
    );
    const transition = page.locator('.derived-edge[data-kind="execution"]');
    await expect(transition).toHaveCount(1);
    await transition.click();
    await expect(
        page.getByRole("heading", { name: "Recorded transitions", exact: true }),
    ).toBeVisible();
    await expect(page.locator(".derived-execution")).toHaveCount(2);
    await page
        .locator(".derived-execution")
        .filter({ hasText: "source-b-tool" })
        .getByRole("button", { name: "Open original execution", exact: true })
        .click();
    await expect(
        page.getByRole("heading", { name: "Action execution", exact: true }),
    ).toBeVisible();
    await expect(page.locator(".run.active")).toContainText("source-b-tool");
    await expect(page.locator(".details")).toContainText(
        "example:broader-check-targets:execution:1",
    );
    await page.getByRole("button", { name: "Construct model", exact: true }).click();
    await expect(
        page.getByRole("heading", { name: "Derived state model", exact: true }),
    ).toBeVisible();
    await expect(page.locator(".derived-execution")).toHaveCount(2);
    await page.locator(".derived-node").first().click();
    await expect(page.getByRole("heading", { name: "State group", exact: true })).toBeVisible();
    await expect(page.locator(".derived-member")).toHaveCount(2);
    await page
        .locator(".derived-member")
        .filter({ hasText: "source-b-tool" })
        .getByRole("button", { name: "Open original observation", exact: true })
        .click();
    await expect(page.locator(".details .detail-title h2")).toHaveText(/^Observation [123]$/u);
    await expect(page.locator(".run.active")).toContainText("source-b-tool");
    await page.getByRole("button", { name: "Construct model", exact: true }).click();
    await expect(page.locator(".derived-member")).toHaveCount(2);
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
    );
    expect(errors).toEqual([]);
});

test("keeps observation-order links separate and highlights a run without removing evidence data", async ({
    page,
}, info) => {
    await openDerivedModel(page, [
        sourceVariant(info, "source-a-tool", { gap: true }),
        sourceVariant(info, "source-b-tool", { gap: true }),
    ]);
    await expect(page.locator('.derived-edge[data-kind="execution"]')).toHaveCount(1);
    await expect(page.locator('.derived-edge[data-kind="observation_order"]')).toHaveCount(0);
    await page.getByRole("checkbox", { name: "Show observation-order links", exact: true }).check();
    const orderLink = page.locator('.derived-edge[data-kind="observation_order"]');
    await expect(orderLink).toHaveCount(1);
    await orderLink.click();
    await expect(
        page.getByRole("heading", { name: "Observation order", exact: true }),
    ).toBeVisible();
    await expect(page.locator(".derived-execution")).toHaveCount(0);
    await expect(page.locator(".derived-order-link")).toHaveCount(2);
    await page
        .locator(".derived-order-link")
        .filter({ hasText: "source-b-tool" })
        .getByRole("button", { name: "Open following observation", exact: true })
        .click();
    await expect(page.getByRole("heading", { name: "Observation 3", exact: true })).toBeVisible();
    await expect(page.locator(".run.active")).toContainText("source-b-tool");
    await page.getByRole("button", { name: "Construct model", exact: true }).click();
    const highlight = page.getByLabel("Highlight run", { exact: true });
    const selectedRun = highlight.locator("option").filter({ hasText: "source-b-tool" });
    const value = await selectedRun.getAttribute("value");
    expect(value).not.toBeNull();
    await highlight.selectOption(value!);
    await expect(highlight).toHaveValue(value!);
    await expect(page.locator(".derived-node")).toHaveCount(3);
    await expect(page.locator(".derived-edge")).toHaveCount(2);
    await highlight.selectOption("all");
    await page
        .getByRole("checkbox", { name: "Show observation-order links", exact: true })
        .uncheck();
    await expect(page.locator('.derived-edge[data-kind="observation_order"]')).toHaveCount(0);
    await expect(page.locator('.derived-edge[data-kind="execution"]')).toHaveCount(1);
    await expect(page.locator(".derived-node")).toHaveCount(3);
});

test("retains a recorded execution when its observations form one derived state group", async ({
    page,
}, info) => {
    await openDerivedModel(page, [sourceVariant(info, "source-a-tool", { selfLoop: true })]);
    await expect(page.locator(".derived-node")).toHaveCount(1);
    await expect(page.locator('.derived-edge[data-kind="execution"]')).toHaveCount(1);
    await page.locator('.derived-edge[data-kind="execution"]').click();
    await expect(page.locator(".derived-execution")).toHaveCount(1);
    await page.locator(".derived-node").click();
    await expect(page.locator(".derived-member")).toHaveCount(2);
});

test("selects a recorded transition directly on the derived-model canvas", async ({
    page,
}, info) => {
    await openDerivedModel(page, [sourceVariant(info, "source-a-tool")]);
    await expect(page.locator(".derived-node")).toHaveCount(2);
    const transition = page.locator('.derived-edge[data-kind="execution"]');
    await expect(transition).toHaveCount(1);
    const graph = page.getByRole("region", { name: "Derived model graph", exact: true });
    await openRenderingOptions(page);
    await page.getByLabel("Model layout", { exact: true }).selectOption("hierarchical");
    await page.locator(".render-options > summary").click();
    await graph.getByRole("button", { name: "Fit model", exact: true }).click();
    const canvas = graph.locator(".derived-graph");
    const bounds = await canvas.boundingBox();
    expect(bounds).not.toBeNull();
    await canvas.click({ position: { x: bounds!.width / 2, y: bounds!.height / 2 } });
    await expect(
        page.getByRole("heading", { name: "Recorded transitions", exact: true }),
    ).toBeVisible();
    await expect(transition).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator(".derived-execution")).toHaveCount(1);
});

test("switches views in the top bar while retaining trace inspection and the constructed model", async ({
    page,
}, info) => {
    await openDerivedModel(page, [sourceVariant(info, "retained-trace")]);
    const navigation = page.getByRole("banner").getByRole("navigation", { name: "Workspace view" });
    await openRenderingOptions(page);
    await page.getByLabel("Model layout", { exact: true }).selectOption("circular");
    const canvas = await page.locator(".derived-graph").elementHandle();
    const stateCount = await page.locator(".derived-node").count();
    await navigation.getByRole("button", { name: "Trace inspection", exact: true }).click();
    await page.getByRole("button", { name: "Next observation", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Observation 2", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Widgets", exact: true }).click();
    await page.getByLabel("Find a widget").fill("next");
    const traceCanvas = await page.locator(".graph").elementHandle();
    const graphBounds = await page.getByRole("region", { name: "Execution graph" }).boundingBox();
    expect(graphBounds!.y).toBeLessThan(200);
    await navigation.getByRole("button", { name: "Construct model", exact: true }).click();
    await expect(page.getByLabel("Model layout", { exact: true })).toHaveValue("circular");
    await expect(page.locator(".derived-node")).toHaveCount(stateCount);
    expect(
        await page
            .locator(".derived-graph")
            .evaluate((element, original) => element === original, canvas),
    ).toBe(true);
    await navigation.getByRole("button", { name: "Trace inspection", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Observation 2", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Widgets", exact: true })).toHaveAttribute(
        "aria-pressed",
        "true",
    );
    await expect(page.getByLabel("Find a widget")).toHaveValue("next");
    expect(
        await page
            .locator(".graph")
            .evaluate((element, original) => element === original, traceCanvas),
    ).toBe(true);
});

test("building opens the model near the top and keeps setup and rendering settings compact", async ({
    page,
}, info) => {
    await page.goto("/");
    await page.getByLabel("Evidence directory").setInputFiles(sourceVariant(info, "model-first"));
    await page.getByRole("button", { name: "Construct model", exact: true }).click();
    await page
        .getByLabel("Matching preset", { exact: true })
        .selectOption({ label: "Page address" });
    await page.getByText("Edit matching rules (JSON)", { exact: true }).click();
    await page.getByRole("button", { name: "Build model", exact: true }).click();
    await expect(
        page.getByRole("heading", { name: "Derived state model", exact: true }),
    ).toBeVisible();
    await expect(page.locator(".model-setup")).not.toHaveAttribute("open");
    await expect(page.locator(".render-options")).not.toHaveAttribute("open");
    const graph = page.getByRole("region", { name: "Derived model graph", exact: true });
    const bounds = await graph.boundingBox();
    expect(bounds!.y).toBeGreaterThanOrEqual(0);
    expect(bounds!.y).toBeLessThan(450);
    const canvas = await page.locator(".derived-graph").elementHandle();
    await openRenderingOptions(page);
    await page.getByLabel("Model layout", { exact: true }).selectOption("circular");
    await page.locator(".render-options > summary").click();
    await page.locator(".model-setup > summary").click();
    await expect(page.getByLabel("Matching preset", { exact: true })).toHaveValue("1");
    await page.locator(".model-setup > summary").click();
    expect(
        await page
            .locator(".derived-graph")
            .evaluate((element, original) => element === original, canvas),
    ).toBe(true);
});
