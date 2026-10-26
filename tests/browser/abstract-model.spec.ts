import { openModelSetup, openRenderingOptions, openConstructedModel } from "./model-controls";
import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { AbstractModel, AbstractionPreview } from "testar-abstraction";
import type { EvidenceEvent } from "../../src/evidence/schema";
import { readEvidenceCase, writeEvidenceCase } from "./evidence-fixtures";

function sourceVariant(
    info: TestInfo,
    name: string,
    options: { orderLink?: boolean; selfLoop?: boolean } = {},
): string {
    const directory = info.outputPath(name);
    const { manifest, events: entries } = readEvidenceCase("broader-oracle-targets");
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
    if (options.orderLink) {
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
        // This observation has no recorded execution connecting it to the previous observation.
        entries.splice(finished, 0, entry);
    }
    writeEvidenceCase(directory, manifest, entries);
    return directory;
}

test("combines recorded transitions while preserving source-scoped execution and observation navigation", async ({
    page,
}, info) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await openConstructedModel(page, [
        sourceVariant(info, "source-a-tool", { orderLink: true }),
        sourceVariant(info, "source-b-tool", { orderLink: true }),
    ]);
    await expect(page.locator(".abstract-model-node")).toHaveCount(3);
    const pendingDownload = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download model", exact: true }).click();
    const download = await pendingDownload;
    expect(download.suggestedFilename()).toBe("abstract-model.json");
    const downloadedPath = await download.path();
    expect(downloadedPath).not.toBeNull();
    const downloaded = JSON.parse(readFileSync(downloadedPath!, "utf8")) as Pick<
        AbstractionPreview,
        "definition" | "policyFingerprint" | "interpreterVersion" | "inputScope"
    > & { model: AbstractModel };
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
    const transition = page.locator('.abstract-model-edge[data-kind="execution"]');
    await expect(transition).toHaveCount(1);
    await transition.click();
    await expect(
        page.getByRole("heading", { name: "Abstract transition", exact: true }),
    ).toBeVisible();
    await expect(page.locator(".abstract-model-execution")).toHaveCount(2);
    await page
        .locator(".abstract-model-execution")
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
    await expect(page.getByRole("heading", { name: "Abstract model", exact: true })).toBeVisible();
    await expect(page.locator(".abstract-model-execution")).toHaveCount(2);
    await page.locator(".abstract-model-node").first().click();
    await expect(page.getByRole("heading", { name: "Abstract state", exact: true })).toBeVisible();
    await expect(page.locator(".abstract-model-member")).toHaveCount(2);
    await page
        .locator(".abstract-model-member")
        .filter({ hasText: "source-b-tool" })
        .getByRole("button", { name: "Open original observation", exact: true })
        .click();
    await expect(page.locator(".details .detail-title h2")).toHaveText(/^Observation [123]$/u);
    await expect(page.locator(".run.active")).toContainText("source-b-tool");
    await page.getByRole("button", { name: "Construct model", exact: true }).click();
    await expect(page.locator(".abstract-model-member")).toHaveCount(2);
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
    );
    expect(errors).toEqual([]);
});

test("keeps observation-order links separate and highlights a run without removing evidence data", async ({
    page,
}, info) => {
    await openConstructedModel(page, [
        sourceVariant(info, "source-a-tool", { orderLink: true }),
        sourceVariant(info, "source-b-tool", { orderLink: true }),
    ]);
    await expect(page.locator('.abstract-model-edge[data-kind="execution"]')).toHaveCount(1);
    await expect(page.locator('.abstract-model-edge[data-kind="observation_order"]')).toHaveCount(
        0,
    );
    await page.getByRole("checkbox", { name: "Show observation-order links", exact: true }).check();
    const orderLink = page.locator('.abstract-model-edge[data-kind="observation_order"]');
    await expect(orderLink).toHaveCount(1);
    await orderLink.click();
    await expect(
        page.getByRole("heading", { name: "Observation-order links", exact: true }),
    ).toBeVisible();
    await expect(page.locator(".abstract-model-execution")).toHaveCount(0);
    await expect(page.locator(".abstract-model-order-link")).toHaveCount(2);
    await page
        .locator(".abstract-model-order-link")
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
    await expect(page.locator(".abstract-model-node")).toHaveCount(3);
    await expect(page.locator(".abstract-model-edge")).toHaveCount(2);
    await highlight.selectOption("all");
    await page
        .getByRole("checkbox", { name: "Show observation-order links", exact: true })
        .uncheck();
    await expect(page.locator('.abstract-model-edge[data-kind="observation_order"]')).toHaveCount(
        0,
    );
    await expect(page.locator('.abstract-model-edge[data-kind="execution"]')).toHaveCount(1);
    await expect(page.locator(".abstract-model-node")).toHaveCount(3);
});

test("retains a recorded execution when its observations form one abstract state", async ({
    page,
}, info) => {
    await openConstructedModel(page, [sourceVariant(info, "source-a-tool", { selfLoop: true })]);
    await expect(page.locator(".abstract-model-node")).toHaveCount(1);
    await expect(page.locator('.abstract-model-edge[data-kind="execution"]')).toHaveCount(1);
    await page.locator('.abstract-model-edge[data-kind="execution"]').click();
    await expect(page.locator(".abstract-model-execution")).toHaveCount(1);
    await page.locator(".abstract-model-node").click();
    await expect(page.locator(".abstract-model-member")).toHaveCount(2);
});

test("selects a recorded transition directly on the abstract-model canvas", async ({
    page,
}, info) => {
    await openConstructedModel(page, [sourceVariant(info, "source-a-tool")]);
    await expect(page.locator(".abstract-model-node")).toHaveCount(2);
    const transition = page.locator('.abstract-model-edge[data-kind="execution"]');
    await expect(transition).toHaveCount(1);
    const graph = page.getByRole("region", { name: "Abstract model graph", exact: true });
    await openRenderingOptions(page);
    await page.getByLabel("Model layout", { exact: true }).selectOption("hierarchical");
    await page.locator(".render-options > summary").click();
    await graph.getByRole("button", { name: "Fit model", exact: true }).click();
    const canvas = graph.locator(".abstract-model-graph");
    const bounds = await canvas.boundingBox();
    expect(bounds).not.toBeNull();
    await canvas.click({ position: { x: bounds!.width / 2, y: bounds!.height / 2 } });
    await expect(
        page.getByRole("heading", { name: "Abstract transition", exact: true }),
    ).toBeVisible();
    await expect(transition).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator(".abstract-model-execution")).toHaveCount(1);
});

test("switches views in the top bar while retaining trace inspection and the constructed model", async ({
    page,
}, info) => {
    await openConstructedModel(page, [sourceVariant(info, "retained-trace")]);
    const navigation = page.getByRole("banner").getByRole("navigation", { name: "Workspace view" });
    await openRenderingOptions(page);
    await page.getByLabel("Model layout", { exact: true }).selectOption("circular");
    const canvas = await page.locator(".abstract-model-graph").elementHandle();
    const stateCount = await page.locator(".abstract-model-node").count();
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
    await expect(page.locator(".abstract-model-node")).toHaveCount(stateCount);
    expect(
        await page
            .locator(".abstract-model-graph")
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
        .getByLabel("Abstraction preset", { exact: true })
        .selectOption({ label: "Page address" });
    await page.getByText("Edit abstraction rules (JSON)", { exact: true }).click();
    await page.getByRole("button", { name: "Build model", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Abstract model", exact: true })).toBeVisible();
    await expect(page.locator(".model-setup")).not.toHaveAttribute("open");
    await expect(page.locator(".render-options")).not.toHaveAttribute("open");
    const graph = page.getByRole("region", { name: "Abstract model graph", exact: true });
    const bounds = await graph.boundingBox();
    expect(bounds!.y).toBeGreaterThanOrEqual(0);
    expect(bounds!.y).toBeLessThan(450);
    const canvas = await page.locator(".abstract-model-graph").elementHandle();
    await openRenderingOptions(page);
    await page.getByLabel("Model layout", { exact: true }).selectOption("circular");
    await page.locator(".render-options > summary").click();
    await page.locator(".model-setup > summary").click();
    await expect(page.getByLabel("Abstraction preset", { exact: true })).toHaveValue("1");
    await page.locator(".model-setup > summary").click();
    expect(
        await page
            .locator(".abstract-model-graph")
            .evaluate((element, original) => element === original, canvas),
    ).toBe(true);
});

test("inspects available actions and unobserved outcomes without exporting invented states", async ({
    page,
}, info) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const directory = sourceVariant(info, "available-action-source");
    const filename = path.join(directory, "evidence.jsonl");
    const events: EvidenceEvent[] = readFileSync(filename, "utf8")
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line));
    const first = events.findIndex(({ event }) => event.event_type === "observation_recorded");
    const entry = events[first].event;
    if (entry.event_type !== "observation_recorded") {
        throw new Error("The fixture must contain an observation.");
    }
    for (let index = 1; index <= 2; index++) {
        const id = "unexecuted-action-" + index;
        entry.data.recorded_state.widgets.push({
            id,
            parent: null,
            properties: { "ui.role": "button", "ui.name": "Alternative " + index },
        });
        entry.data.available_actions.push({ action_description: id, target_widget: id });
        events.splice(first, 0, {
            schema_version: 3,
            id: "event:" + id,
            event: {
                event_type: "action_described",
                data: { id, action_type: "click", properties: {} },
            },
        });
    }
    writeFileSync(filename, events.map((event) => JSON.stringify(event)).join("\n") + "\n");
    await openConstructedModel(page, [directory]);
    await openModelSetup(page);
    await page
        .getByLabel("Abstraction preset", { exact: true })
        .selectOption({ label: "Page address and available actions" });
    await page.getByRole("button", { name: "Build model", exact: true }).click();
    const actions = page.getByRole("region", { name: "Abstract actions", exact: true });
    await expect(
        actions.getByRole("heading", { name: "Abstract actions (4)", exact: true }),
    ).toBeVisible();
    await actions.getByRole("button", { name: /Alternative 1/ }).click();
    const inspector = page.locator(".abstract-model-inspector");
    await expect(
        inspector.getByRole("heading", { name: "Abstract action", exact: true }),
    ).toBeVisible();
    await expect(inspector).toContainText("No matched execution in the selected evidence.");
    await expect(inspector).toContainText("Reported availability (1)");
    const graph = page.getByRole("region", { name: "Abstract model graph", exact: true });
    const canvas = await graph.locator("canvas").first().elementHandle();
    await page
        .getByRole("checkbox", { name: "Show actions with unobserved outcomes", exact: true })
        .uncheck();
    await page
        .getByRole("checkbox", { name: "Show actions with unobserved outcomes", exact: true })
        .check();
    expect(
        await graph
            .locator("canvas")
            .first()
            .evaluate((element, original) => element === original, canvas),
    ).toBe(true);
    const markerCounts = await page.locator(".abstract-model-graph").evaluate((element) => {
        const cy = (
            element as HTMLElement & {
                _cyreg: {
                    cy: {
                        nodes: () => {
                            filter: (selector: string) => {
                                length: number;
                                first: () => { emit: (event: string) => void };
                            };
                        };
                        edges: () => { filter: (selector: string) => { length: number } };
                    };
                };
            }
        )._cyreg.cy;
        const markers = cy.nodes().filter(".unobserved-outcome");
        markers.first().emit("tap");
        return { nodes: markers.length, links: cy.edges().filter(".available-link").length };
    });
    expect(markerCounts).toEqual({ nodes: 1, links: 3 });
    const grouping = page.getByRole("checkbox", {
        name: "Group unknown-outcome links by state",
        exact: true,
    });
    await expect(grouping).not.toBeChecked();
    await grouping.check();
    const groupedCount = await page.locator(".abstract-model-graph").evaluate((element) => {
        const cy = (
            element as HTMLElement & {
                _cyreg: {
                    cy: {
                        edges: () => {
                            filter: (selector: string) => {
                                length: number;
                                first: () => { emit: (event: string) => void };
                            };
                        };
                    };
                };
            }
        )._cyreg.cy;
        cy.edges().filter('.available-link[renderLabel *= "2 actions"]').first().emit("tap");
        return cy.edges().filter(".available-link").length;
    });
    expect(groupedCount).toBe(2);
    await expect(inspector.getByRole("button", { name: /Alternative 1/ })).toBeVisible();
    await expect(inspector.getByRole("button", { name: /Alternative 2/ })).toBeVisible();
    await grouping.uncheck();
    await page.locator(".abstract-model-graph").evaluate((element) => {
        const cy = (
            element as HTMLElement & {
                _cyreg: {
                    cy: {
                        nodes: () => {
                            filter: (selector: string) => {
                                first: () => { emit: (event: string) => void };
                            };
                        };
                    };
                };
            }
        )._cyreg.cy;
        cy.nodes().filter(".unobserved-outcome").first().emit("tap");
    });

    await expect(
        inspector.getByRole("heading", { name: "Outcome not observed", exact: true }),
    ).toBeVisible();
    await page.locator(".abstract-model-graph").evaluate((element) => {
        const cy = (
            element as HTMLElement & {
                _cyreg: {
                    cy: {
                        edges: () => {
                            filter: (selector: string) => {
                                first: () => { emit: (event: string) => void };
                            };
                        };
                    };
                };
            }
        )._cyreg.cy;
        cy.edges().filter('.available-link[edgeId *= "Alternative 1"]').first().emit("tap");
    });
    await expect(
        inspector.getByRole("heading", { name: "Abstract action", exact: true }),
    ).toBeVisible();
    const pending = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download model", exact: true }).click();
    const download = await pending;
    const exported = JSON.parse(readFileSync((await download.path())!, "utf8")) as {
        model: AbstractModel;
    };
    expect(exported.model.nodes).toHaveLength(2);
    expect(exported.model.edges).toHaveLength(1);
    expect(exported.model.actionEvidence!.actions).toHaveLength(4);
    expect(exported.model.nodes.every((node) => node.members.length > 0)).toBe(true);
    await inspector.getByRole("button", { name: "Open original observation", exact: true }).click();
    await expect(page.locator(".details .detail-title h2")).toHaveText("Observation 1");
    expect(errors).toEqual([]);
});
