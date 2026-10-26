import { openRenderingOptions } from "./model-controls";
import { expect, test, type Page, type TestInfo } from "@playwright/test";
import type { Core } from "cytoscape";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { AbstractModel } from "testar-abstraction";
import type { EvidenceEvent } from "../../src/evidence/schema";
import { sharedCases } from "../support";

const broader = sharedCases().find(
    (directory) => path.basename(directory) === "broader-oracle-targets",
)!;

type GraphContainer = HTMLElement & { _cyreg: { cy: Core } };

function sourceVariant(
    info: TestInfo,
    name: string,
    branch: string,
    unmatched: boolean,
    pagesOverride?: Array<string | null>,
): string {
    const directory = info.outputPath(name);
    mkdirSync(directory, { recursive: true });
    writeFileSync(
        path.join(directory, "manifest.json"),
        readFileSync(path.join(broader, "manifest.json")),
    );
    const original: EvidenceEvent[] = readFileSync(path.join(broader, "evidence.jsonl"), "utf8")
        .trimEnd()
        .split("\n")
        .map((line) => JSON.parse(line));
    const run = structuredClone(
        original.flatMap(({ event }) =>
            event.event_type === "test_run_started" ? [event.data] : [],
        )[0],
    );
    const action = original.flatMap(({ event }) =>
        event.event_type === "action_described" ? [event.data] : [],
    )[0];
    const template = original.flatMap(({ event }) =>
        event.event_type === "observation_recorded" ? [event.data] : [],
    )[0];
    run.producer = name;
    const entries: EvidenceEvent[] = [];
    function add(event: EvidenceEvent["event"]): void {
        entries.push({ schema_version: 3, id: "browser:event:" + (entries.length + 1), event });
    }
    add({ event_type: "test_run_started", data: run });
    add({
        event_type: "test_sequence_started",
        data: {
            id: template.test_sequence,
            test_run: run.id,
            sequence_index: 1,
            source_sequence: "1",
            properties: {},
        },
    });
    add({ event_type: "action_described", data: action });
    const pages: Array<string | null> = pagesOverride
        ? [...pagesOverride]
        : ["a", branch, "d", "d"];
    if (unmatched) {
        pages.push(null);
    }
    for (const [index, page] of pages.entries()) {
        const sequence = index + 1;
        const observation = structuredClone(template);
        observation.id = "browser:observation:" + sequence;
        observation.observation_index = sequence;
        observation.timestamp_micros = sequence * 1000;
        observation.recorded_state.id = "browser:snapshot:" + sequence;
        observation.recorded_state.properties["ui.title"] = "Visit " + sequence;
        if (page !== null) {
            observation.recorded_state.properties["ui.url"] = "https://sut.example/page/" + page;
        }
        observation.artifacts = [];
        const execution = "browser:execution:" + index;
        if (index > 0 && page !== null) {
            add({
                event_type: "action_selected",
                data: {
                    id: execution,
                    test_sequence: template.test_sequence,
                    source_observation: "browser:observation:" + index,
                    action_description: action.id,
                    target_widget: "next",
                    parameters: {},
                },
            });
            add({
                event_type: "action_execution_reported",
                data: { action_execution: execution, outcome: "returned", error: null },
            });
        }
        add({ event_type: "observation_recorded", data: observation });
        if (index > 0 && page !== null) {
            add({
                event_type: "transition_recorded",
                data: { action_execution: execution, resulting_observation: observation.id },
            });
        }
    }
    add({
        event_type: "test_sequence_finished",
        data: { test_sequence: template.test_sequence, reason: "sequence complete" },
    });
    add({
        event_type: "test_run_finished",
        data: { test_run: run.id, reason: "sequence complete" },
    });
    writeFileSync(
        path.join(directory, "evidence.jsonl"),
        entries.map((entry) => JSON.stringify(entry)).join("\n") + "\n",
    );
    return directory;
}

async function openModelDirectories(page: Page, directories: string[]): Promise<void> {
    await page.goto("/");
    for (const [index, directory] of directories.entries()) {
        await page.getByLabel("Evidence directory").setInputFiles(directory);
        await expect(page.locator(".source")).toHaveCount(index + 1);
    }
    await page.getByRole("button", { name: "Construct model", exact: true }).click();
    await page
        .getByLabel("Abstraction preset", { exact: true })
        .selectOption({ label: "Page address" });
    await page.getByRole("button", { name: "Build model", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Abstract model", exact: true })).toBeVisible();
    await expect(page.locator(".abstract-model-graph canvas").first()).toBeVisible();
    await page
        .getByRole("checkbox", { name: "Show observation-order links", exact: true })
        .uncheck();
}

async function openModel(page: Page, info: TestInfo): Promise<void> {
    await openModelDirectories(page, [
        sourceVariant(info, "render-source-a", "b", false),
        sourceVariant(info, "render-source-b", "c", true),
    ]);
    await expect(page.locator(".abstract-model-node")).toHaveCount(5);
    await expect(page.locator(".abstract-model-edge")).toHaveCount(5);
}

async function snapshot(page: Page) {
    return page.locator(".abstract-model-graph").evaluate((element) => {
        const graph = (element as GraphContainer)._cyreg.cy;
        return {
            nodes: graph.nodes().map((node) => ({
                id: node.id(),
                identity: String(node.data("nodeId")),
                x: node.position("x"),
                y: node.position("y"),
                label: String(node.style("label")),
                opacity: Number(node.style("opacity")),
                display: String(node.style("display")),
                dimmed: node.hasClass("dimmed"),
                selected: node.selected(),
                unmatched: node.hasClass("unmatched"),
            })),
            edges: graph.edges().map((edge) => ({
                id: edge.id(),
                identity: String(edge.data("edgeId")),
                source: edge.source().id(),
                target: edge.target().id(),
                label: String(edge.style("label")),
                display: String(edge.style("display")),
            })),
        };
    });
}

function positions(graph: Awaited<ReturnType<typeof snapshot>>) {
    return graph.nodes
        .map(({ id, x, y }) => ({ id, x, y }))
        .sort((left, right) => left.id.localeCompare(right.id));
}

function finitePositions(graph: Awaited<ReturnType<typeof snapshot>>): boolean {
    return graph.nodes.every((node) => Number.isFinite(node.x) && Number.isFinite(node.y));
}

async function selectSource(page: Page, name: string): Promise<void> {
    const source = page.getByLabel("Highlight source", { exact: true });
    const value = await source.locator("option").filter({ hasText: name }).getAttribute("value");
    expect(value).not.toBeNull();
    await source.selectOption(value!);
}

async function downloadModel(page: Page): Promise<unknown> {
    const pendingDownload = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download model", exact: true }).click();
    const download = await pendingDownload;
    expect(download.suggestedFilename()).toBe("abstract-model.json");
    const downloadedPath = await download.path();
    expect(downloadedPath).not.toBeNull();
    return JSON.parse(readFileSync(downloadedPath!, "utf8"));
}

test("changes graph layouts while label and highlight controls preserve node positions", async ({
    page,
}, info) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await openModel(page, info);
    await openRenderingOptions(page);
    const layout = page.getByLabel("Model layout", { exact: true });
    await expect(layout).toHaveValue("force");
    const force = await snapshot(page);
    expect(finitePositions(force)).toBe(true);
    await layout.selectOption("hierarchical");
    await expect.poll(async () => positions(await snapshot(page))).not.toEqual(positions(force));
    const hierarchical = await snapshot(page);
    expect(finitePositions(hierarchical)).toBe(true);
    await layout.selectOption("circular");
    await expect
        .poll(async () => positions(await snapshot(page)))
        .not.toEqual(positions(hierarchical));
    expect(finitePositions(await snapshot(page))).toBe(true);
    await layout.selectOption("force");
    await page.getByRole("button", { name: "Reapply layout", exact: true }).click();
    await page.getByRole("button", { name: "Fit model", exact: true }).click();
    const originalPositions = positions(await snapshot(page));
    expect((await snapshot(page)).nodes.every((node) => node.label.length > 0)).toBe(true);
    await page.getByLabel("Show state labels", { exact: true }).uncheck();
    await expect
        .poll(async () => (await snapshot(page)).nodes.every((node) => node.label === ""))
        .toBe(true);
    await page.getByLabel("Show action labels", { exact: true }).uncheck();
    expect((await snapshot(page)).edges.every((edge) => !edge.label.includes("activate"))).toBe(
        true,
    );
    await page.getByLabel("Show execution counts", { exact: true }).uncheck();
    await expect
        .poll(async () => (await snapshot(page)).edges.every((edge) => edge.label === ""))
        .toBe(true);
    await page.getByLabel("Show action labels", { exact: true }).check();
    const withoutCounts = (await snapshot(page)).edges.find((edge) => edge.source === edge.target)!;
    expect(withoutCounts.label).toContain("activate");
    expect(withoutCounts.label).not.toContain("2");
    await page.getByLabel("Show execution counts", { exact: true }).check();
    expect(
        (await snapshot(page)).edges.find((edge) => edge.source === edge.target)!.label,
    ).toContain("2");
    await page.getByLabel("Show state labels", { exact: true }).check();
    await selectSource(page, "render-source-a");
    const dimmed = () =>
        snapshot(page).then((graph) => graph.nodes.filter((node) => node.dimmed && !node.selected));
    await expect.poll(async () => (await dimmed()).length).toBeGreaterThan(0);
    for (const node of await dimmed()) {
        expect(node.opacity).toBeCloseTo(0.18);
    }
    await openRenderingOptions(page);
    const dimming = page.getByLabel("Dim other evidence", { exact: true });
    await dimming.focus();
    await dimming.press("Home");
    for (let step = 0; step < 5; step++) {
        await dimming.press("PageUp");
    }
    await expect(dimming).toHaveValue("50");
    await expect
        .poll(async () => (await dimmed()).every((node) => Math.abs(node.opacity - 0.5) < 0.001))
        .toBe(true);
    const run = page.getByLabel("Highlight run", { exact: true });
    const selectedRun = await run
        .locator('option:not([value="all"])')
        .first()
        .getAttribute("value");
    expect(selectedRun).not.toBeNull();
    await run.selectOption(selectedRun!);
    expect(positions(await snapshot(page))).toEqual(originalPositions);
    await page.getByLabel("Highlight source", { exact: true }).selectOption("all");
    expect(positions(await snapshot(page))).toEqual(originalPositions);
    expect(errors).toEqual([]);
});

test("shows only selected evidence with accurate support while keeping the downloaded evidence unchanged", async ({
    page,
}, info) => {
    await openModel(page, info);
    const originalModel = await downloadModel(page);
    const originalPositions = positions(await snapshot(page));
    await selectSource(page, "render-source-a");
    await page.getByLabel("Show only selected source/run", { exact: true }).check();
    await expect(page.locator(".abstract-model-node")).toHaveCount(3);
    await expect(page.locator(".abstract-model-edge")).toHaveCount(3);
    const filtered = await snapshot(page);
    expect(filtered.nodes.filter((node) => node.display !== "none")).toHaveLength(3);
    expect(filtered.edges.filter((edge) => edge.display !== "none")).toHaveLength(3);
    expect(
        filtered.nodes.filter((node) => node.unmatched).every((node) => node.display === "none"),
    ).toBe(true);
    expect(positions(filtered)).toEqual(originalPositions);
    const loop = filtered.edges.find((edge) => edge.source === edge.target)!;
    expect(loop.label).toContain("1");
    await page.locator(".abstract-model-graph").evaluate((element) => {
        const graph = (element as GraphContainer)._cyreg.cy;
        graph
            .edges()
            .filter((edge) => edge.source().id() === edge.target().id())
            .first()
            .emit("tap");
    });
    await expect(page.locator(".abstract-model-execution")).toHaveCount(1);
    await expect(page.locator(".abstract-model-execution")).toContainText("render-source-a");
    await expect(page.locator(".abstract-model-execution")).not.toContainText("render-source-b");
    await page.getByLabel("Show only selected source/run", { exact: true }).uncheck();
    await expect(page.locator(".abstract-model-node")).toHaveCount(5);
    await expect(page.locator(".abstract-model-edge")).toHaveCount(5);
    await expect(page.locator(".abstract-model-execution")).toHaveCount(2);
    await page.getByLabel("Highlight source", { exact: true }).selectOption("all");
    const run = page.getByLabel("Highlight run", { exact: true });
    const sourceBRun = await run
        .locator("option")
        .filter({ hasText: "render-source-b" })
        .getAttribute("value");
    expect(sourceBRun).not.toBeNull();
    await run.selectOption(sourceBRun!);
    await page.getByLabel("Show only selected source/run", { exact: true }).check();
    await expect(page.locator(".abstract-model-node")).toHaveCount(4);
    await expect(page.locator(".abstract-model-edge")).toHaveCount(3);
    await expect(page.locator(".abstract-model-execution")).toHaveCount(1);
    await expect(page.locator(".abstract-model-execution")).toContainText("render-source-b");
    expect(positions(await snapshot(page))).toEqual(originalPositions);
    expect(await downloadModel(page)).toEqual(originalModel);
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
    );
});

test("keeps a large graph window stable when selecting visible evidence and loads an outside state", async ({
    page,
}, info) => {
    test.setTimeout(90_000);
    const pages = Array.from({ length: 505 }, (_, index) => "large-" + (index + 1));
    await openModelDirectories(page, [
        sourceVariant(info, "render-large-source", "unused", false, pages),
    ]);
    const original = await snapshot(page);
    expect(original.nodes).toHaveLength(500);
    expect(finitePositions(original)).toBe(true);
    const originalPositions = positions(original);
    const downloaded = (await downloadModel(page)) as { model: AbstractModel };
    const visibleNodes = new Set(original.nodes.map((node) => node.identity));
    const visibleEdges = new Set(original.edges.map((edge) => edge.identity));
    const nodes = downloaded.model.nodes.filter((node) => visibleNodes.has(node.id));
    for (const node of nodes.slice(0, 2)) {
        const button = page.locator(".abstract-model-node").filter({
            has: page.getByText(node.label, { exact: true }),
        });
        await button.click();
        await expect(button).toHaveAttribute("aria-pressed", "true");
        expect(positions(await snapshot(page))).toEqual(originalPositions);
        await button.click();
        expect(positions(await snapshot(page))).toEqual(originalPositions);
    }
    const edge = downloaded.model.edges.find((item) => visibleEdges.has(item.id))!;
    const source = downloaded.model.nodes.find((node) => node.id === edge.source)!;
    const target = downloaded.model.nodes.find((node) => node.id === edge.target)!;
    const endpoints = source.label + " \u2192 " + target.label;
    const transition = page.locator(".abstract-model-edge").filter({
        has: page.getByText(endpoints, { exact: true }),
    });
    await transition.click();
    await expect(transition).toHaveAttribute("aria-pressed", "true");
    expect(positions(await snapshot(page))).toEqual(originalPositions);
    await transition.click();
    expect(positions(await snapshot(page))).toEqual(originalPositions);
    const outside = downloaded.model.nodes.find((node) => !visibleNodes.has(node.id))!;
    const outsideButton = page.locator(".abstract-model-node").filter({
        has: page.getByText(outside.label, { exact: true }),
    });
    for (let batch = 0; batch < 11 && (await outsideButton.count()) === 0; batch++) {
        await page.getByRole("button", { name: "Show more states", exact: true }).click();
    }
    await expect(outsideButton).toHaveCount(1);
    await outsideButton.click();
    await expect(outsideButton).toHaveAttribute("aria-pressed", "true");
    await expect
        .poll(async () => (await snapshot(page)).nodes.some((node) => node.identity === outside.id))
        .toBe(true);
    const nextWindow = await snapshot(page);
    expect(nextWindow.nodes).toHaveLength(500);
    expect(finitePositions(nextWindow)).toBe(true);
});
