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
        .filter((entry) => entry.event.event_type !== "test_run_finished");
    const first = entries.find((entry) => entry.event.event_type === "observation_recorded").event
        .data;
    first.artifacts = [];
    first.recorded_state.properties = { "ui.title": "Example", "example.unchecked": true };
    const widget = first.recorded_state.widgets[0];
    widget.properties = { "ui.name": "Primary widget", "ui.enabled": true };
    first.recorded_state.widgets.push({
        id: "other-widget",
        parent: null,
        properties: { "ui.text": "Other widget", "example.other": true },
    });
    const second = structuredClone(first);
    second.id = "example:second";
    second.observation_index = first.observation_index + 1;
    second.recorded_state.id = "example:second-snapshot";
    entries.push({
        schema_version: 3,
        id: "example:second-event",
        event: { event_type: "observation_recorded", data: second },
    });
    const targets = [
        {
            target_type: "widget_property",
            observation: first.id,
            widget: widget.id,
            property: "ui.enabled",
        },
        { target_type: "observation", observation: first.id },
        { target_type: "test_run" },
        {
            target_type: "observation_range",
            first_observation: first.id,
            last_observation: second.id,
        },
        { target_type: "state_property", observation: first.id, property: "ui.title" },
    ];
    ["passed", "failed", "pending", "unknown", "error"].forEach((status, index) => {
        entries.push({
            schema_version: 3,
            id: "example:check:" + index,
            event: {
                event_type: "oracle_result_recorded",
                data: {
                    test_run: entries[0].event.data.id,
                    ...(targets[index].target_type === "test_run"
                        ? {}
                        : { test_sequence: first.test_sequence }),
                    name: "Condition " + status,
                    oracle: { id: "example:rule:" + index },
                    oracle_target: targets[index],
                    oracle_status: status,
                    oracle_details: {},
                },
            },
        });
    });
    entries.push({
        schema_version: 3,
        id: "example:finished",
        event: {
            event_type: "test_sequence_finished",
            data: { test_sequence: first.test_sequence, reason: "done" },
        },
    });
    entries.push({
        schema_version: 3,
        id: "run-finished",
        event: {
            event_type: "test_run_finished",
            data: { test_run: entries[0].event.data.id, reason: "done" },
        },
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
    await page.getByLabel("Evidence directory").setInputFiles(sample(info.outputPath("evidence")));
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
    await page.getByLabel("Evidence directory").setInputFiles(sample(info.outputPath("evidence")));
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
    await page.getByLabel("Evidence directory").setInputFiles(sample(info.outputPath("evidence")));
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
