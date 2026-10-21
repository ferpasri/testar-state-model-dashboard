import { describe, expect, it } from "vitest";
import {
    buildDerivedModel,
    DEFAULT_PRESETS,
    previewMatching,
    runKey,
    type AnalysisSource,
} from "../src/analysis";
import { groupLabel } from "../src/analysis/derivedLabels";
import type { Observation } from "../src/evidence/schema";

function source(id: string, properties: Record<string, unknown>): AnalysisSource {
    const observation: Observation = {
        id: "visit",
        run: "run",
        sequence: 1,
        timestamp_micros: 1,
        state: { id: "state", properties, widgets: [], capture: "complete" },
        candidates: [],
        artifacts: [],
        candidate_scope: "unknown",
    };
    return {
        id,
        label: id,
        fingerprint: id,
        model: {
            manifest: { schema_version: 2, model: id },
            eventCount: 1,
            runs: new Map([
                [
                    "run",
                    {
                        id: "run",
                        producer: "generic",
                        source_run: "run",
                        properties: {},
                        status: "finished",
                        reason: "finished",
                    },
                ],
            ]),
            observations: new Map([["visit", observation]]),
            snapshots: new Map([["state", observation.state]]),
            actions: new Map(),
            executions: new Map(),
            checks: [],
        },
    };
}

async function preview(properties: Record<string, unknown>[], preset = DEFAULT_PRESETS[0]) {
    const sources = properties.map((values, index) => source("source-" + index, values));
    const result = await previewMatching(
        sources,
        preset.definition,
        sources.map((item) => runKey(item.id, "run")),
    );
    return { result, sources };
}

const url = "https://sut.example/account";

describe("page matching defaults", () => {
    it("uses captured titles and addresses while leaving URL-only comparison available", async () => {
        expect(DEFAULT_PRESETS[0].name).toBe("Page address and title");
        const properties = [
            { "ui.url": url, "ui.title": "Sign in" },
            { "ui.url": url, "ui.title": "Account overview" },
        ];
        const { result } = await preview(properties);
        expect(result.groups).toHaveLength(2);
        const addressOnly = DEFAULT_PRESETS.find((item) => item.name === "Page address")!;
        expect((await preview(properties, addressOnly)).result.groups).toHaveLength(1);
    });

    it("normalizes title whitespace while retaining captured values and letter case", async () => {
        const original = "  Account \n overview  ";
        const { result } = await preview([
            { "ui.url": url, "ui.title": original },
            { "ui.url": url, "ui.title": "Account overview" },
            { "ui.url": url, "ui.title": "ACCOUNT overview" },
        ]);
        expect(result.groups.map((group) => group.members.length).sort()).toEqual([1, 2]);
        const combined = result.groups.find((group) => group.members.length === 2)!;
        expect(
            combined.members[0].stateFields.find((field) => field.name === "title"),
        ).toMatchObject({ raw: original, value: "Account overview", key: "ui.title" });
    });

    it("reports unavailable titles separately and preserves explicitly captured empty titles", async () => {
        const { result } = await preview([
            { "ui.url": url },
            { "ui.url": url, "ui.title": "" },
            { "ui.url": url, "ui.title": null },
        ]);
        expect(result.unmatched).toHaveLength(2);
        expect(result.groups).toHaveLength(1);
        expect(result.groups[0].members[0].stateFields[0]).toMatchObject({
            raw: "",
            value: "",
            missing: false,
        });
        expect(groupLabel(result.groups[0], 0)).toContain(url);
        expect(groupLabel(result.groups[0], 0)).not.toContain("title:");
    });

    it("includes the title in widget-structure comparison", () => {
        const preset = DEFAULT_PRESETS.find((item) => item.name === "Page and widget structure")!;
        expect(preset.definition.state.map((field) => field.keys)).toEqual([
            ["ui.title"],
            ["ui.url"],
        ]);
    });

    it("keeps session identifiers significant until the JSON rule explicitly removes them", async () => {
        const properties = [
            { "ui.url": url + ";session=one", "ui.title": "Account" },
            { "ui.url": url + ";session=two", "ui.title": "Account" },
        ];
        expect((await preview(properties)).result.groups).toHaveLength(2);
        const custom = structuredClone(DEFAULT_PRESETS[0]);
        custom.definition.state.find((field) => field.name === "address")!.transforms = [
            { op: "url", remove_path_parameters: ["session"] },
        ];
        const { result, sources } = await preview(properties, custom);
        expect(result.groups).toHaveLength(1);
        const model = buildDerivedModel(result, sources);
        expect(model.nodes[0].label).toContain("Account");
        expect(model.nodes[0].label.indexOf("Account")).toBeLessThan(
            model.nodes[0].label.indexOf("address"),
        );
        expect(sources[0].model.observations.get("visit")!.state.properties["ui.url"]).toBe(
            url + ";session=one",
        );
    });

    it("puts a selected captured title before address text in graph labels", async () => {
        const { result } = await preview([{ "ui.url": url, "ui.title": "Account overview" }]);
        const group = structuredClone(result.groups[0]);
        group.members[0].stateFields.reverse();
        expect(groupLabel(group, 0)).toMatch(/^Account overview/u);
    });
});
