import { expect, test } from "@playwright/test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { sharedCases } from "../support";

function metadataModel(directory: string): string {
    const initial = sharedCases().find((item) => path.basename(item) === "initial-observation")!;
    mkdirSync(directory, { recursive: true });
    const entries = readFileSync(path.join(initial, "evidence.jsonl"), "utf8")
        .trimEnd()
        .split("\n")
        .map((line) => JSON.parse(line))
        .filter(
            (entry) =>
                !["oracle_result_recorded", "test_run_finished"].includes(entry.event.event_type),
        );
    const observation = entries.find((entry) => entry.event.event_type === "observation_recorded")
        .event.data;
    observation.artifacts = [];
    observation.recorded_state.properties = {
        "ui.title": "Captured form",
        "evidence.capture": {
            area: "Top document",
            widget_selection: "All available widgets",
            property_selection: "Selected concrete properties",
            limits: { property_characters: 32 },
            truncated: true,
        },
    };
    observation.recorded_state.widgets = [
        {
            id: "widget",
            parent: null,
            properties: {
                "source.text": "Ready",
                "ui.text": "Ready",
                "ui.name": "Aliased widget",
                "evidence.property_aliases": { "ui.text": "source.text" },
                "evidence.omitted_properties": [
                    {
                        property: "source.color",
                        reason: "limit",
                        explanation: "Value limit reached",
                    },
                ],
            },
        },
    ];
    observation.available_actions = [];
    function check(
        id: string,
        details: Record<string, unknown>,
        status = "pending",
        property = false,
    ) {
        entries.push({
            schema_version: 3,
            id,
            event: {
                event_type: "oracle_result_recorded",
                data: {
                    test_run: entries[0].event.data.id,
                    test_sequence: observation.test_sequence,
                    name: id,
                    oracle: { id: "rule:" + id },
                    oracle_status: status,
                    oracle_target: property
                        ? {
                              target_type: "widget_property",
                              observation: observation.id,
                              widget: "widget",
                              property: "source.text",
                          }
                        : {
                              target_type: "observation_range",
                              first_observation: observation.id,
                              last_observation: observation.id,
                          },
                    oracle_details: details,
                },
            },
        });
    }
    check("during report", {
        "evidence.assessment": { phase: "during_run", semantics: "open_ended" },
    });
    check("text report", {}, "passed", true);
    entries.push({
        schema_version: 3,
        id: "sequence-finish",
        event: {
            event_type: "test_sequence_finished",
            data: { test_sequence: observation.test_sequence, reason: "deadline" },
        },
    });
    entries.push({
        schema_version: 3,
        id: "finish",
        event: {
            event_type: "test_run_finished",
            data: { test_run: entries[0].event.data.id, reason: "deadline" },
        },
    });
    check("shared final report", {
        "evidence.assessment": {
            phase: "end_of_run",
            semantics: "open_ended",
            termination_reason: "deadline",
        },
    });
    check("native final report", {
        "producer.assessment_phase": "end_of_run",
        "producer.termination_reason": "deadline",
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

test("shows capture selection and groups alias coverage while listing known omissions separately", async ({
    page,
}, info) => {
    await page.goto("/");
    await page
        .getByLabel("Evidence directory")
        .setInputFiles(metadataModel(info.outputPath("evidence")));
    await expect(page.getByRole("heading", { name: "Observation 1", exact: true })).toBeVisible();
    const capture = page.getByRole("region", { name: "Capture description" });
    await expect(capture).toContainText("Selected concrete properties");
    await expect(capture).toContainText("capture limit omitted");
    await page.getByRole("button", { name: "Coverage", exact: true }).click();
    const coverage = page.getByRole("region", { name: "Recorded evaluation coverage" });
    await expect(coverage).toContainText("1 of 1 state properties have no property result");
    await page.getByLabel("Widget coverage", { exact: true }).selectOption("all");
    const widget = coverage.locator(".widget").first();
    await widget.locator("summary").click();
    const properties = widget.locator(".property-coverage");
    await expect(properties.locator(".coverage-properties").first()).not.toContainText(
        "source.text",
    );
    await properties.getByLabel("Only properties without recorded evaluations").uncheck();
    const row = properties
        .locator(".coverage-properties")
        .first()
        .locator("li")
        .filter({ has: page.locator("code", { hasText: "source.text" }) });
    await expect(row).toContainText("Also recorded as: ui.text");
    await expect(row).toContainText("1 results");
    await expect(properties).toContainText("2 captured properties shown");
    const omissions = properties.getByRole("region", { name: "Known property omissions" });
    await expect(omissions).toContainText("source.color");
    await expect(omissions).toContainText("Capture limit");
    await expect(properties.locator(".coverage-properties").first()).not.toContainText(
        "evidence.property_aliases",
    );
});

test("filters final assessments and keeps their pending status and original sequence scope", async ({
    page,
}, info) => {
    await page.goto("/");
    await page
        .getByLabel("Evidence directory")
        .setInputFiles(metadataModel(info.outputPath("evidence")));
    await page.getByRole("button", { name: "Evaluations", exact: true }).click();
    await expect(page.locator(".evaluation")).toHaveCount(4);
    const phase = page.getByRole("group", { name: "Assessment phase" });
    await phase.getByRole("button", { name: "End of run (1)", exact: true }).click();
    await expect(page.locator(".evaluation")).toHaveCount(1);
    await expect(page.locator(".evaluation .badge.pending")).toHaveCount(1);
    await expect(page.locator(".evaluation").first()).toContainText("end of run");
    await expect(page.locator(".evaluation").first()).toContainText("Run ending: deadline");
    await expect(page.locator(".evaluation").first()).toContainText("Target: observation range");
    await expect(page.locator(".evaluation").first()).toContainText("future observations");
    await page
        .getByRole("group", { name: "Evaluation status" })
        .getByRole("button", { name: "Passed (1)", exact: true })
        .click();
    await expect(page.locator(".evaluation")).toHaveCount(0);
    await phase.getByRole("button", { name: "All phases (4)", exact: true }).click();
    await expect(page.locator(".evaluation")).toHaveCount(1);
    await expect(page.locator(".evaluation .badge.passed")).toHaveCount(1);
});
