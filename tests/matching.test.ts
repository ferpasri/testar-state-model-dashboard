import { describe, expect, it } from "vitest";
import {
    buildEvidenceIndex,
    DEFAULT_PRESETS,
    ABSTRACTION_LIMITS,
    parseAbstractionRules,
    previewAbstraction,
    runKey,
    type AnalysisSource,
    type AbstractionRules,
} from "../src/analysis";
import { canonical, parseJson } from "../src/evidence/common";
import type { ReconstructedEvidence } from "../src/evidence/reconstructed-evidence";
import type { Observation } from "../src/evidence/schema";

type Widget = Observation["recorded_state"]["widgets"][number];
type ObservationInput = {
    id?: string;
    run?: string;
    properties?: Record<string, unknown>;
    widgets?: Widget[];
    capture?: Observation["recorded_state"]["capture"];
};

function source(id: string, observationInputs: ObservationInput[]): AnalysisSource {
    const observations = observationInputs.map((observation, index): Observation => ({
        id: observation.id ?? "observation-" + index,
        test_sequence: observation.run ?? "run",
        observation_index: index,
        timestamp_micros: index,
        recorded_state: {
            id: "snapshot-" + index,
            properties: observation.properties ?? {},
            widgets: observation.widgets ?? [],
            capture: observation.capture ?? "complete",
        },
        available_actions: [],
        artifacts: [],
        available_action_scope: "unknown",
    }));
    const evidence: ReconstructedEvidence = {
        manifest: { schema_version: 3, evidence_id: "evidence" },
        eventCount: observations.length,
        runs: new Map(
            [...new Set(observations.map((item) => item.test_sequence))].map((run) => [
                run,
                {
                    id: run,
                    producer: "generic",
                    source_run: run,
                    properties: {},
                    status: "finished",
                    reason: "finished",
                },
            ]),
        ),
        observations: new Map(observations.map((observation) => [observation.id, observation])),
        sequences: new Map(
            [...new Set(observations.map((item) => item.test_sequence))].map((id) => [
                id,
                {
                    id,
                    test_run: id,
                    sequence_index: 1,
                    source_sequence: id,
                    properties: {},
                    status: "finished",
                    reason: "finished",
                },
            ]),
        ),
        actions: new Map(),
        executions: new Map(),
        oracleResults: [],
        recordedStates: new Map(
            observations.map((observation) => [
                observation.recorded_state.id,
                observation.recorded_state,
            ]),
        ),
    };
    return { id, label: id, fingerprint: "fingerprint-" + id, evidence };
}

function widget(
    id: string,
    properties: Record<string, unknown>,
    parent: string | null = null,
): Widget {
    return { id, parent, properties };
}

function runs(sources: AnalysisSource[]): string[] {
    return sources.flatMap((item) =>
        [...item.evidence.runs.keys()].map((run) => runKey(item.id, run)),
    );
}

function policy(overrides: Partial<AbstractionRules> = {}): AbstractionRules {
    return {
        version: 1,
        name: "Example comparison",
        state: [{ name: "page", keys: ["ui.url"], required: true }],
        capture: "same",
        ...overrides,
    };
}

function widgetPolicy(
    overrides: Partial<NonNullable<AbstractionRules["widgets"]>> = {},
): AbstractionRules {
    return policy({
        widgets: {
            fields: [{ name: "name", keys: ["ui.name"] }],
            hierarchy: "flat",
            order: "sort",
            descendants: "exclude",
            ...overrides,
        },
    });
}

async function preview(sources: AnalysisSource[], definition = policy()) {
    return previewAbstraction(sources, definition, runs(sources));
}

describe("shared evidence index", () => {
    it("scopes colliding tool identifiers and indexes selected actions and executions", () => {
        const sources = ["first", "second"].map((id) =>
            source(id, [
                { id: "same", properties: { "ui.url": "/login" }, widgets: [widget("same", {})] },
            ]),
        );
        for (const item of sources) {
            item.evidence.actions.set("action", {
                id: "action",
                action_type: "click",
                properties: {},
            });
            item.evidence.observations
                .get("same")!
                .available_actions.push({ action_description: "action", target_widget: "same" });
            item.evidence.executions.set("execution", {
                execution: {
                    id: "execution",
                    test_sequence: "run",
                    source_observation: "same",
                    action_description: "action",
                    target_widget: "same",
                    parameters: {},
                },
                status: "incomplete",
                resultingObservation: null,
                executionResult: null,
            });
        }
        const index = buildEvidenceIndex(sources, runs(sources));
        expect(index.counts).toEqual({
            sources: 2,
            runs: 2,
            observations: 2,
            widgets: 2,
            actions: 2,
            executions: 2,
        });
        expect([...index.widgets.values()].map((item) => item.reference.source)).toEqual([
            "first",
            "second",
        ]);
    });

    it("restricts comparison to the explicitly selected source/run scope", async () => {
        const item = source("source", [
            { run: "awaiting_execution_result", properties: { "ui.url": "/login" } },
            { run: "other", properties: { "ui.url": "/login" } },
        ]);
        const result = await previewAbstraction([item], policy(), [
            runKey(item.id, "awaiting_execution_result"),
        ]);
        expect(result.index.observations).toBe(1);
        expect(result.inputScope.runs).toEqual([
            { source: "source", run: "awaiting_execution_result" },
        ]);
        expect(result.inputScope.sources[0].fingerprint).toBe(item.fingerprint);
        expect(result.counts.sharedGroups).toBe(0);
    });

    it("rejects stale run selections and duplicate source fingerprints", () => {
        const first = source("first", [{ properties: { "ui.url": "/login" } }]);
        expect(() => buildEvidenceIndex([first], [runKey("first", "missing")])).toThrow(
            "no longer available",
        );
        const duplicate = { ...first, id: "copy" };
        expect(() => buildEvidenceIndex([first, duplicate], runs([first, duplicate]))).toThrow(
            "unique identity",
        );
    });

    it("bounds selected observations and widgets", () => {
        const oversized = source(
            "large",
            Array.from({ length: ABSTRACTION_LIMITS.observations + 1 }, () => ({})),
        );
        expect(() => buildEvidenceIndex([oversized], runs([oversized]))).toThrow(
            "10,000 observations",
        );
        const manyWidgets = source("widgets", [
            {
                widgets: Array.from({ length: ABSTRACTION_LIMITS.widgets + 1 }, (_, index) =>
                    widget("w" + index, {}),
                ),
            },
        ]);
        expect(() => buildEvidenceIndex([manyWidgets], runs([manyWidgets]))).toThrow(
            "100,000 captured widgets",
        );
    });
});

describe("deterministic abstraction rules (JSON)s", () => {
    it("validates versions, operations, unknown fields, duplicate names and byte limits", () => {
        expect(() => parseAbstractionRules(canonical({ ...policy(), version: 99 }))).toThrow(
            "version",
        );
        expect(() =>
            parseAbstractionRules(
                canonical(
                    policy({
                        state: [
                            { name: "x", keys: ["x"], transforms: [{ op: "execute" } as never] },
                        ],
                    }),
                ),
            ),
        ).toThrow("transforms");
        expect(() => parseAbstractionRules(canonical({ ...policy(), algorithm: "guess" }))).toThrow(
            "Definition",
        );
        expect(() =>
            parseAbstractionRules(
                canonical(
                    policy({
                        state: [
                            { name: "x", keys: ["a"] },
                            { name: "x", keys: ["b"] },
                        ],
                    }),
                ),
            ),
        ).toThrow("unique");
        expect(() =>
            parseAbstractionRules(" ".repeat(ABSTRACTION_LIMITS.definitionBytes + 1)),
        ).toThrow("64 KiB");
    });

    it("ships presets in the same validated language as custom definitions", () => {
        for (const preset of DEFAULT_PRESETS) {
            expect(parseAbstractionRules(canonical(preset.definition))).toEqual(preset.definition);
        }
    });

    it("matches source-specific values through explicit fallback keys and mappings", async () => {
        const sources = [
            source("first", [{ properties: { "tool.page": " SIGN IN " } }]),
            source("second", [{ properties: { "ui.page": "login" } }]),
        ];
        const result = await preview(
            sources,
            policy({
                state: [
                    {
                        name: "page",
                        keys: ["ui.page", "tool.page"],
                        required: true,
                        transforms: [
                            { op: "trim" },
                            { op: "lowercase" },
                            { op: "map", values: { "sign in": "login" } },
                        ],
                    },
                ],
            }),
        );
        expect(result.groups).toHaveLength(1);
        expect(result.counts.sharedGroups).toBe(1);
        expect(result.groups[0].members.map((item) => item.stateFields[0].key)).toEqual([
            "tool.page",
            "ui.page",
        ]);
        expect(result.groups[0].members[0].stateFields[0].raw).toBe(" SIGN IN ");
    });

    it("normalizes actual whitespace and replaces every literal occurrence", async () => {
        const sources = [
            source("first", [{ properties: { name: "  Hello\t  world\nworld  " } }]),
            source("second", [{ properties: { name: "Hello item item" } }]),
        ];
        const result = await preview(
            sources,
            policy({
                state: [
                    {
                        name: "label",
                        keys: ["name"],
                        transforms: [
                            { op: "trim" },
                            { op: "collapse_whitespace" },
                            { op: "replace", find: "world", with: "item" },
                        ],
                    },
                ],
            }),
        );
        expect(result.groups).toHaveLength(1);
        expect(result.groups[0].members[0].stateFields[0].value).toBe("Hello item item");
    });

    it("removes only explicitly selected URL query keys and fragments", async () => {
        const sources = [
            source("first", [
                { properties: { "ui.url": "https://example.test/login?nonce=1&mode=admin#form" } },
            ]),
            source("second", [
                { properties: { "ui.url": "https://example.test/login?nonce=2&mode=admin#top" } },
            ]),
            source("third", [
                { properties: { "ui.url": "https://example.test/login?nonce=3&mode=user" } },
            ]),
        ];
        const result = await preview(
            sources,
            policy({
                state: [
                    {
                        name: "page",
                        keys: ["ui.url"],
                        transforms: [{ op: "url", remove_query: ["nonce"], remove_fragment: true }],
                    },
                ],
            }),
        );
        expect(result.groups.map((group) => group.members.length).sort()).toEqual([1, 2]);
    });

    it("keeps missing and explicit null distinct and rejects required missing values", async () => {
        const sources = [
            source("missing", [{}]),
            source("null", [{ properties: { selected: null } }]),
            source("value", [{ properties: { selected: "value" } }]),
        ];
        const result = await preview(
            sources,
            policy({
                state: [{ name: "field", keys: ["selected"] }],
            }),
        );
        expect(result.groups).toHaveLength(2);
        expect(result.unmatched[0].reason).toContain("None of the selected fields");
        expect(
            result.groups
                .flatMap((group) => group.members)
                .find((member) => member.reference.source === "null")!.stateFields[0].value,
        ).toBeNull();
        const required = await preview(
            sources,
            policy({ state: [{ name: "field", keys: ["selected"], required: true }] }),
        );
        expect(required.unmatched[0].reason).toContain("Required field");
    });

    it("retains optional missing readings when another selected value is present", async () => {
        const sources = [
            source("missing", [{ properties: { common: true } }]),
            source("null", [{ properties: { common: true, selected: null } }]),
        ];
        const result = await preview(
            sources,
            policy({
                state: [
                    { name: "common", keys: ["common"] },
                    { name: "field", keys: ["selected"] },
                ],
            }),
        );
        expect(result.groups).toHaveLength(2);
        expect(result.unmatched).toHaveLength(0);
    });

    it("does not read inherited properties or treat a mapping prototype as a value", async () => {
        const sources = [
            source("missing", [{ properties: { common: true } }]),
            source("captured", [
                {
                    properties: parseJson('{"common":true,"constructor":"name"}') as Record<
                        string,
                        unknown
                    >,
                },
            ]),
        ];
        const result = await preview(
            sources,
            policy({
                state: [
                    { name: "common", keys: ["common"] },
                    {
                        name: "constructor",
                        keys: ["constructor"],
                        transforms: [{ op: "map", values: {} }],
                    },
                ],
            }),
        );
        expect(result.groups).toHaveLength(2);
        expect(result.unmatched).toHaveLength(0);
    });

    it("keeps exact large integer identities without converting them to floats", async () => {
        const sources = [
            source("first", [{ properties: { count: 9007199254740992n } }]),
            source("second", [{ properties: { count: 9007199254740993n } }]),
        ];
        const result = await preview(
            sources,
            policy({ state: [{ name: "count", keys: ["count"] }] }),
        );
        expect(result.groups).toHaveLength(2);
    });

    it("isolates invalid scalar transformations and oversized replacements", async () => {
        const sources = [
            source("number", [{ properties: { value: 42 } }]),
            source("large", [{ properties: { value: "a".repeat(1000) } }]),
        ];
        const result = await preview(
            sources,
            policy({
                state: [
                    {
                        name: "value",
                        keys: ["value"],
                        transforms: [{ op: "replace", find: "a", with: "x".repeat(4096) }],
                    },
                ],
            }),
        );
        expect(result.groups).toHaveLength(0);
        expect(result.unmatched[0].reason).toContain("1 MiB");
        expect(result.unmatched[1].reason).toContain("needs a string");
    });
});

describe("widget comparisons and original evidence", () => {
    it("filters dynamic subtrees before comparing observations", async () => {
        const sources = [
            source("first", [
                {
                    properties: { "ui.url": "/home" },
                    widgets: [
                        widget("root", { "ui.name": "Home" }),
                        widget("dynamic", { "ui.name": "Clock", kind: "dynamic" }, "root"),
                        widget("time", { "ui.name": "12:01" }, "dynamic"),
                        widget("button", { "ui.name": "Continue" }, "root"),
                    ],
                },
            ]),
            source("second", [
                {
                    properties: { "ui.url": "/home" },
                    widgets: [
                        widget("root", { "ui.name": "Home" }),
                        widget("button", { "ui.name": "Continue" }, "root"),
                    ],
                },
            ]),
        ];
        const result = await preview(
            sources,
            widgetPolicy({
                hierarchy: "tree",
                exclude: [{ keys: ["kind"], op: "equals", value: "dynamic" }],
            }),
        );
        expect(result.groups).toHaveLength(1);
        expect(result.groups[0].members[0].excludedWidgets).toBe(2);
        expect(result.groups[0].members[0].includedWidgets).toBe(2);
    });

    it("retains and reparents children when excluded parents are kept out of comparison", async () => {
        const sources = [
            source("first", [
                {
                    properties: { "ui.url": "/home" },
                    widgets: [
                        widget("root", { "ui.name": "Home" }),
                        widget("wrapper", { ignored: true }, "root"),
                        widget("button", { "ui.name": "Continue" }, "wrapper"),
                    ],
                },
            ]),
            source("second", [
                {
                    properties: { "ui.url": "/home" },
                    widgets: [
                        widget("root", { "ui.name": "Home" }),
                        widget("button", { "ui.name": "Continue" }, "root"),
                    ],
                },
            ]),
        ];
        const result = await preview(
            sources,
            widgetPolicy({
                hierarchy: "tree",
                descendants: "keep",
                exclude: [{ keys: ["ignored"], op: "present" }],
            }),
        );
        expect(result.groups).toHaveLength(1);
        expect(result.groups[0].members[0].excludedWidgets).toBe(1);
    });

    it("applies contains exclusions to native values before field normalization", async () => {
        const sources = [
            source("source", [
                {
                    properties: { "ui.url": "/home" },
                    widgets: [
                        widget("clock", { "ui.name": "Clock 12:34" }),
                        widget("button", { "ui.name": "Continue" }),
                    ],
                },
            ]),
        ];
        const result = await preview(
            sources,
            widgetPolicy({
                exclude: [{ keys: ["ui.name"], op: "contains", value: "Clock" }],
            }),
        );
        expect(result.groups[0].members[0].excludedWidgets).toBe(1);
    });

    it("supports selected widget order while preserving duplicate counts", async () => {
        const sources = [
            source("first", [
                {
                    properties: { "ui.url": "/home" },
                    widgets: [widget("a", { "ui.name": "A" }), widget("b", { "ui.name": "B" })],
                },
            ]),
            source("second", [
                {
                    properties: { "ui.url": "/home" },
                    widgets: [widget("b", { "ui.name": "B" }), widget("a", { "ui.name": "A" })],
                },
            ]),
            source("third", [
                {
                    properties: { "ui.url": "/home" },
                    widgets: [
                        widget("a", { "ui.name": "A" }),
                        widget("b", { "ui.name": "B" }),
                        widget("c", { "ui.name": "B" }),
                    ],
                },
            ]),
        ];
        const sorted = await preview(sources, widgetPolicy());
        expect(sorted.groups.map((group) => group.members.length).sort()).toEqual([1, 2]);
        const preserved = await preview(sources, widgetPolicy({ order: "preserve" }));
        expect(preserved.groups).toHaveLength(3);
    });

    it("distinguishes hierarchy changes even if flat widget values match", async () => {
        const sources = [
            source("first", [
                {
                    properties: { "ui.url": "/home" },
                    widgets: [
                        widget("a", { "ui.name": "A" }),
                        widget("b", { "ui.name": "B" }, "a"),
                    ],
                },
            ]),
            source("second", [
                {
                    properties: { "ui.url": "/home" },
                    widgets: [widget("a", { "ui.name": "A" }), widget("b", { "ui.name": "B" })],
                },
            ]),
        ];
        expect((await preview(sources, widgetPolicy())).groups).toHaveLength(1);
        expect((await preview(sources, widgetPolicy({ hierarchy: "tree" }))).groups).toHaveLength(
            2,
        );
    });

    it("flags duplicate widget descriptions as ambiguous rather than asserting one-to-one matches", async () => {
        const sources = ["first", "second"].map((id) =>
            source(id, [
                {
                    properties: { "ui.url": "/home" },
                    widgets: [
                        widget("a", { "ui.name": "Delete" }),
                        widget("b", { "ui.name": "Delete" }),
                    ],
                },
            ]),
        );
        const result = await preview(sources, widgetPolicy());
        const correspondence = result.groups[0].widgetCorrespondences[0];
        expect(correspondence.ambiguous).toBe(true);
        expect(correspondence.members).toHaveLength(4);
        expect(new Set(correspondence.members.map((item) => item.source)).size).toBe(2);
    });

    it("isolates unavailable widgets and respects explicit capture comparison", async () => {
        const sources = [
            source("complete", [{ properties: { "ui.url": "/home" } }]),
            source("filtered", [{ properties: { "ui.url": "/home" }, capture: "filtered" }]),
            source("unavailable", [{ properties: { "ui.url": "/home" }, capture: "unavailable" }]),
        ];
        expect((await preview(sources)).groups).toHaveLength(3);
        expect((await preview(sources, policy({ capture: "ignore" }))).groups).toHaveLength(1);
        const withWidgets = await preview(sources, widgetPolicy());
        expect(withWidgets.unmatched).toHaveLength(1);
        expect(withWidgets.unmatched[0].reason).toContain("unavailable");
    });

    it("bounds deep widget hierarchies with an observation diagnostic", async () => {
        const sources = [
            source("source", [
                {
                    properties: { "ui.url": "/home" },
                    widgets: Array.from(
                        { length: ABSTRACTION_LIMITS.hierarchyDepth + 1 },
                        (_, index) =>
                            widget(
                                "w" + index,
                                { "ui.name": "Item" },
                                index === 0 ? null : "w" + (index - 1),
                            ),
                    ),
                },
            ]),
        ];
        const result = await preview(sources, widgetPolicy({ hierarchy: "tree" }));
        expect(result.unmatched[0].reason).toContain("depth of 128");
    });

    it("keeps group identities stable under source input order and preserves the input evidence", async () => {
        const sources = ["first", "second"].map((id) =>
            source(id, [
                {
                    properties: { "ui.url": "https://example.test/home#top", "ui.title": "Home" },
                    widgets: [widget("a", { "ui.name": "Continue" })],
                },
            ]),
        );
        const before = sources.map((item) => canonical([...item.evidence.observations]));
        const first = await preview(sources, DEFAULT_PRESETS[0].definition);
        const second = await preview([...sources].reverse(), DEFAULT_PRESETS[0].definition);
        expect(first).toEqual(second);
        expect(sources.map((item) => canonical([...item.evidence.observations]))).toEqual(before);
        expect(first.policyFingerprint).toMatch(/^[a-f0-9]{64}$/u);
        expect(first.definition).toEqual(DEFAULT_PRESETS[0].definition);
        expect(first.interpreterVersion).toBe("1.1.0");
    });

    it("keeps unknown widget placeholders without proposing unsupported correspondences", async () => {
        const sources = ["first", "second"].map((id) =>
            source(id, [
                {
                    properties: { "ui.url": "/home" },
                    widgets: [widget("unknown", { unrelated: "data" })],
                },
            ]),
        );
        const result = await preview(sources, widgetPolicy());
        expect(result.groups).toHaveLength(1);
        expect(result.groups[0].members[0].includedWidgets).toBe(1);
        expect(result.groups[0].widgetCorrespondences).toHaveLength(0);
    });

    it("bounds expanded hierarchy descriptions before serializing repeated ancestor values", async () => {
        const sources = [
            source("source", [
                {
                    properties: { "ui.url": "/home" },
                    widgets: Array.from({ length: 100 }, (_, index) =>
                        widget(
                            "w" + index,
                            { "ui.name": index === 0 ? "x".repeat(512 * 1024) : "child" },
                            index === 0 ? null : "w" + (index - 1),
                        ),
                    ),
                },
            ]),
        ];
        await expect(preview(sources, widgetPolicy({ hierarchy: "tree" }))).rejects.toThrow(
            "32 MiB",
        );
    });
});
