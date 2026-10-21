import { expect, test } from "@playwright/test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { sharedCases } from "../support";

const initial = sharedCases().find(
    (directory) => path.basename(directory) === "initial-observation",
)!;

function sample(directory: string) {
    mkdirSync(directory, { recursive: true });
    const entries = readFileSync(path.join(initial, "evidence.jsonl"), "utf8")
        .trimEnd()
        .split("\n")
        .map((line) => JSON.parse(line))
        .filter((entry) => entry.event.kind !== "run_finished");
    const first = entries.find((entry) => entry.event.kind === "observed").event.data;
    first.artifacts = [];
    first.state.properties = { "ui.title": "Example", "example.unchecked": true };
    const widget = first.state.widgets[0];
    widget.properties = { "ui.name": "Primary widget", "ui.enabled": true };
    first.state.widgets.push({
        id: "other-widget",
        parent: null,
        properties: { "ui.text": "Other widget", "example.other": true },
    });
    const second = structuredClone(first);
    second.id = "example:second";
    second.sequence = first.sequence + 1;
    second.state.id = "example:second-snapshot";
    entries.push({
        schema_version: 2,
        id: "example:second-event",
        event: { kind: "observed", data: second },
    });
    const targets = [
        {
            kind: "widget_property",
            observation: first.id,
            widget: widget.id,
            property: "ui.enabled",
        },
        { kind: "observation", observation: first.id },
        { kind: "run" },
        { kind: "sequence", from_observation: first.id, to_observation: second.id },
        { kind: "state_property", observation: first.id, property: "ui.title" },
    ];
    ["passed", "failed", "pending", "unknown", "error"].forEach((status, index) => {
        entries.push({
            schema_version: 2,
            id: "example:check:" + index,
            event: {
                kind: "checked",
                data: {
                    run: first.run,
                    name: "Condition " + status,
                    rule: { id: "example:rule:" + index },
                    target: targets[index],
                    status,
                    details: {},
                },
            },
        });
    });
    entries.push({
        schema_version: 2,
        id: "example:finished",
        event: { kind: "run_finished", data: { run: first.run, reason: "done" } },
    });
    writeFileSync(
        path.join(directory, "manifest.json"),
        readFileSync(path.join(initial, "manifest.json")),
    );
    writeFileSync(
        path.join(directory, "evidence.jsonl"),
        entries.map((entry) => JSON.stringify(entry)).join("\n") + "\n",
    );
    return directory;
}

test("filters evaluation outcomes without changing reported coverage", async ({ page }, info) => {
    await page.goto("/");
    await page.getByLabel("Model directory").setInputFiles(sample(info.outputPath("model")));
    await expect(page.getByRole("heading", { name: "Observation 1", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Evaluations", exact: true }).click();
    const filters = page.getByRole("group", { name: "Evaluation status" });
    for (const status of ["Passed", "Failed", "Pending", "Unknown", "Error"]) {
        await filters.getByRole("button", { name: status + " (1)", exact: true }).click();
        await expect(page.locator(".evaluation")).toHaveCount(1);
        await expect(page.locator(".evaluation .badge")).toHaveText(status.toLowerCase());
    }
    await filters.getByRole("button", { name: "All (5)", exact: true }).click();
    await expect(page.locator(".evaluation")).toHaveCount(5);
});

test("lists captured items without direct results and navigates to uncovered visits", async ({
    page,
}, info) => {
    await page.goto("/");
    await page.getByLabel("Model directory").setInputFiles(sample(info.outputPath("model")));
    await page.getByRole("button", { name: "Coverage", exact: true }).click();
    const coverage = page.getByRole("region", { name: "Recorded evaluation coverage" });
    await expect(coverage).toContainText("1 of 2 captured widgets have no direct result");
    await expect(coverage).toContainText("1 of 2 visits match");
    const state = coverage.locator(".property-coverage").first();
    await expect(state.getByText("example.unchecked", { exact: true })).toBeVisible();
    await expect(state.getByText("ui.title", { exact: true })).toHaveCount(0);
    await state.getByLabel("Only properties without recorded evaluations").uncheck();
    await expect(state.getByText("ui.title", { exact: true })).toBeVisible();
    await page.getByLabel("Widget coverage", { exact: true }).selectOption("no-results");
    await expect(coverage.locator(".widget")).toHaveCount(1);
    await expect(coverage.locator(".widget summary")).toContainText("Other widget");
    await coverage.getByRole("button", { name: /Observation 2: 0 observation-level/ }).click();
    await expect(
        page.getByRole("heading", { name: "Observation 2", exact: true, level: 2 }),
    ).toBeVisible();
    await expect(coverage).toContainText("2 of 2 captured widgets have no direct result");
});

test("inspects and hides unknown observation-order links without inventing executions", async ({
    page,
}, info) => {
    await page.goto("/");
    await page.getByLabel("Model directory").setInputFiles(sample(info.outputPath("model")));
    const graph = page.getByRole("region", { name: "Execution graph" });
    await expect(graph.locator(".graph-note")).toContainText("Observation order only (1)");
    await expect(graph.locator("canvas").first()).toBeVisible();
    await graph.getByRole("button", { name: "Fit trace", exact: true }).click();
    const canvas = graph.locator(".graph");
    const bounds = await canvas.boundingBox();
    await canvas.click({ position: { x: bounds!.width / 2, y: bounds!.height / 2 } });
    await expect(
        page.getByRole("heading", { name: "Observation order", exact: true }),
    ).toBeVisible();
    await expect(page.locator(".details")).toContainText("There may have been no action");
    await page.getByRole("button", { name: "Open later observation (2)", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Observation 2", exact: true })).toBeVisible();
    await graph.getByLabel("Show observation-order links").uncheck();
    await expect(graph.locator(".graph-note")).not.toContainText("Observation order only");
    await page.getByRole("button", { name: "Executions", exact: true }).click();
    await expect(page.locator(".details")).toContainText("No associated action execution");
});
