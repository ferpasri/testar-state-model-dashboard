import { describe, expect, it } from "vitest";
import {
    buildDerivedModel,
    previewMatching,
    runKey,
    type AnalysisSource,
    type MatchingDefinition,
} from "../src/analysis";
import { canonical } from "../src/evidence/common";
import type {
    ReconstructedEvidence,
    RecordedExecution,
} from "../src/evidence/reconstructed-evidence";
import type { Observation } from "../src/evidence/schema";

const definition: MatchingDefinition = {
    version: 1,
    name: "Page comparison",
    state: [{ name: "page", keys: ["ui.url"], required: true }],
    capture: "same",
};

function source(id: string, pages: Array<string | null>, runIds: string[] = []): AnalysisSource {
    const observations = pages.map((page, index): Observation => ({
        id: "observation-" + index,
        test_sequence: runIds[index] ?? "run",
        observation_index: index,
        timestamp_micros: index,
        recorded_state: {
            id: "snapshot-" + index,
            properties: page === null ? {} : { "ui.url": page },
            widgets: [],
            capture: "complete",
        },
        available_actions: [],
        artifacts: [],
        available_action_scope: "unknown",
    }));
    const evidence: ReconstructedEvidence = {
        manifest: { schema_version: 3, evidence_id: "evidence" },
        eventCount: observations.length,
        runs: new Map(
            [...new Set(observations.map((observation) => observation.test_sequence))].map(
                (run) => [
                    run,
                    {
                        id: run,
                        producer: "generic",
                        source_run: run,
                        properties: {},
                        status: "finished",
                        reason: "finished",
                    },
                ],
            ),
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

function addExecution(
    item: AnalysisSource,
    id: string,
    from: number,
    to: number | null,
    kind = "click",
    status: RecordedExecution["status"] = "completed",
): void {
    const origin = item.evidence.observations.get("observation-" + from)!;
    const action = "action-" + id;
    item.evidence.actions.set(action, { id: action, action_type: kind, properties: { label: id } });
    origin.available_actions.push({ action_description: action, target_widget: null });
    item.evidence.executions.set(id, {
        execution: {
            id,
            test_sequence: origin.test_sequence,
            source_observation: origin.id,
            action_description: action,
            target_widget: null,
            parameters: { originalParameter: id },
        },
        status,
        resultingObservation: to === null ? null : "observation-" + to,
        executionResult:
            status === "failed"
                ? { action_execution: id, outcome: "error", error: "Reported execution error" }
                : null,
    });
}

function selectedRuns(sources: AnalysisSource[]): string[] {
    return sources.flatMap((item) =>
        [...item.evidence.runs.keys()].map((run) => runKey(item.id, run)),
    );
}

async function derived(sources: AnalysisSource[]) {
    const preview = await previewMatching(sources, definition, selectedRuns(sources));
    return { preview, model: buildDerivedModel(preview, sources) };
}

function originalEvidence(sources: AnalysisSource[]): string {
    return canonical(
        sources.map((item) => ({
            observations: [...item.evidence.observations],
            actions: [...item.evidence.actions],
            executions: [...item.evidence.executions],
        })),
    );
}

describe("derived nodes and original observation scope", () => {
    it("retains singleton groups and gives each unmatched observation its own diagnostic node", async () => {
        const sources = [source("source", ["/login", null, null, "/home"])];
        const { model } = await derived(sources);
        expect(model.counts).toMatchObject({
            matchedNodes: 2,
            unmatchedNodes: 2,
            observations: 4,
            completedExecutions: 0,
            orderLinks: 3,
        });
        expect(model.nodes.flatMap((node) => node.members)).toHaveLength(4);
        expect(
            model.nodes
                .filter((node) => node.unmatchedReason)
                .every((node) => node.members.length === 1),
        ).toBe(true);
        expect(
            model.nodes
                .filter((node) => node.unmatchedReason)
                .every((node) => node.unmatchedReason!.includes("Required field")),
        ).toBe(true);
    });

    it("recovers observations omitted from a preview as diagnostic nodes instead of dropping evidence", async () => {
        const sources = [source("source", ["/login", "/home"])];
        const { preview } = await derived(sources);
        preview.groups = preview.groups.filter((group) => group.members[0].sequence === 0);
        const model = buildDerivedModel(preview, sources);
        expect(model.nodes).toHaveLength(2);
        expect(model.nodes.find((node) => node.unmatchedReason)?.unmatchedReason).toContain(
            "not represented",
        );
    });

    it("restricts nodes, action edges, and order links to the selected source/run scope", async () => {
        const first = source(
            "first",
            ["/a", "/b", "/c", "/d"],
            ["awaiting_execution_result", "awaiting_execution_result", "other", "other"],
        );
        addExecution(first, "selected-execution", 0, 1);
        addExecution(first, "other-execution", 2, 3);
        const excluded = source("excluded", ["/a", "/b"]);
        addExecution(excluded, "excluded-execution", 0, 1);
        const preview = await previewMatching([first, excluded], definition, [
            runKey(first.id, "awaiting_execution_result"),
        ]);
        const model = buildDerivedModel(preview, [first, excluded]);
        expect(model.counts.observations).toBe(2);
        expect(model.counts.completedExecutions).toBe(1);
        expect(
            model.nodes
                .flatMap((node) => node.members)
                .every(
                    (reference) =>
                        reference.source === "first" &&
                        reference.run === "awaiting_execution_result",
                ),
        ).toBe(true);
        expect(
            model.edges.flatMap((edge) => edge.executions).map((reference) => reference.execution),
        ).toEqual(["selected-execution"]);
    });

    it("validates original source fingerprints and rejects overlapping group memberships", async () => {
        const sources = [source("source", ["/a"])];
        const { preview } = await derived(sources);
        expect(() => buildDerivedModel(preview, [])).toThrow("missing or has changed");
        expect(() =>
            buildDerivedModel(preview, [{ ...sources[0], fingerprint: "changed" }]),
        ).toThrow("missing or has changed");
        preview.groups.push({ ...preview.groups[0], id: "other-group" });
        expect(() => buildDerivedModel(preview, sources)).toThrow("more than one derived node");
    });

    it("keeps labels concise even when selected comparison values are large", async () => {
        const sources = [source("source", ["x".repeat(10000)])];
        const { model } = await derived(sources);
        expect(model.nodes[0].label.length).toBeLessThanOrEqual(110);
        expect(model.nodes[0].members[0].observation).toBe("observation-0");
    });
});

describe("derived execution edges", () => {
    it("aggregates the same directed action kind across sources without losing colliding execution IDs", async () => {
        const sources = ["first", "second"].map((id) => source(id, ["/login", "/home"]));
        for (const item of sources) {
            addExecution(item, "execution", 0, 1);
        }
        const { model } = await derived(sources);
        expect(model.counts).toMatchObject({
            matchedNodes: 2,
            observations: 4,
            executionEdges: 1,
            completedExecutions: 2,
            orderEdges: 0,
        });
        const edge = model.edges[0];
        expect(edge.actionKind).toBe("click");
        expect(edge.executions).toEqual([
            { source: "first", run: "run", execution: "execution" },
            { source: "second", run: "run", execution: "execution" },
        ]);
        expect(edge.orderLinks).toEqual([]);
        for (const reference of edge.executions) {
            const original = sources
                .find((item) => item.id === reference.source)!
                .evidence.executions.get(reference.execution)!;
            expect(original.execution.parameters).toEqual({ originalParameter: "execution" });
            expect(original.execution.action_description).toBe("action-execution");
        }
    });

    it("keeps exact action kinds separate while aggregating different original actions of the same kind", async () => {
        const item = source("source", ["/a", "/b", "/a", "/b", "/a", "/b"]);
        addExecution(item, "click-one", 0, 1, "click");
        addExecution(item, "click-two", 2, 3, "click");
        addExecution(item, "type-one", 4, 5, "type");
        const { model } = await derived([item]);
        const actionEdges = model.edges.filter((edge) => edge.kind === "execution");
        expect(actionEdges).toHaveLength(2);
        expect(actionEdges.find((edge) => edge.actionKind === "click")?.executions).toHaveLength(2);
        expect(actionEdges.find((edge) => edge.actionKind === "type")?.executions).toHaveLength(1);
        expect(model.counts.completedExecutions).toBe(3);
    });

    it("preserves self-loops and distinguishes reverse edges", async () => {
        const item = source("source", ["/a", "/a", "/b", "/a"]);
        addExecution(item, "loop", 0, 1);
        addExecution(item, "forward", 1, 2);
        addExecution(item, "reverse", 2, 3);
        const { model } = await derived([item]);
        const edges = model.edges.filter((edge) => edge.kind === "execution");
        expect(edges).toHaveLength(3);
        expect(edges.filter((edge) => edge.source === edge.target)).toHaveLength(1);
        const forward = edges.find((edge) => edge.executions[0].execution === "forward")!;
        const reverse = edges.find((edge) => edge.executions[0].execution === "reverse")!;
        expect(forward.source).toBe(reverse.target);
        expect(forward.target).toBe(reverse.source);
        expect(forward.id).not.toBe(reverse.id);
    });

    it("retains selected, submitted, rejected, and incomplete executions without inventing edges", async () => {
        const item = source("source", ["/a", "/b", "/c", "/d", "/e"]);
        const statuses = [
            "awaiting_execution_result",
            "awaiting_resulting_observation",
            "failed",
            "incomplete",
        ] as const;
        statuses.forEach((status, index) =>
            addExecution(item, status, index, null, "click", status),
        );
        const { model } = await derived([item]);
        expect(model.counts.completedExecutions).toBe(0);
        expect(model.counts.executionEdges).toBe(0);
        expect(model.counts.unlinkedExecutions).toBe(4);
        expect(model.counts.orderLinks).toBe(4);
        expect(model.unlinkedExecutions.map((execution) => execution.status).sort()).toEqual(
            [...statuses].sort(),
        );
        expect(
            model.unlinkedExecutions.every(
                (execution) => execution.sourceNode !== null && execution.reason.length > 0,
            ),
        ).toBe(true);
    });

    it("retains completed executions between diagnostic unmatched nodes", async () => {
        const item = source("source", [null, null]);
        addExecution(item, "execution", 0, 1);
        const { model } = await derived([item]);
        expect(model.counts).toMatchObject({
            matchedNodes: 0,
            unmatchedNodes: 2,
            executionEdges: 1,
            completedExecutions: 1,
            orderLinks: 0,
        });
        expect(model.edges[0].source).toMatch(/^unmatched:/u);
        expect(model.edges[0].target).toMatch(/^unmatched:/u);
    });

    it("preserves unusable completion records without fabricating a cross-run action edge", async () => {
        const item = source("source", ["/a", "/b"], ["first-run", "second-run"]);
        addExecution(item, "invalid-cross-run", 0, 1);
        const { model } = await derived([item]);
        expect(model.counts.executionEdges).toBe(0);
        expect(model.counts.unlinkedExecutions).toBe(1);
        expect(model.unlinkedExecutions[0].reason).toContain("selected run");
        expect(model.counts.orderLinks).toBe(0);
    });

    it("retains an execution when its original action description is unavailable", async () => {
        const item = source("source", ["/a", "/b"]);
        addExecution(item, "execution", 0, 1);
        item.evidence.actions.clear();
        const { model } = await derived([item]);
        expect(model.counts.executionEdges).toBe(0);
        expect(model.unlinkedExecutions[0].reason).toContain("action description");
    });
});

describe("observation order and reproducibility", () => {
    it("aggregates order links separately even when another run has a completed action between the same derived nodes", async () => {
        const withAction = source("action", ["/a", "/b"]);
        const withGap = source("gap", ["/a", "/b"]);
        addExecution(withAction, "execution", 0, 1);
        const { model } = await derived([withAction, withGap]);
        expect(model.edges).toHaveLength(2);
        const action = model.edges.find((edge) => edge.kind === "execution")!;
        const gap = model.edges.find((edge) => edge.kind === "observation_order")!;
        expect(action.source).toBe(gap.source);
        expect(action.target).toBe(gap.target);
        expect(gap.executions).toEqual([]);
        expect(gap.orderLinks).toEqual([
            {
                source: { source: "gap", run: "run", observation: "observation-0" },
                target: { source: "gap", run: "run", observation: "observation-1" },
            },
        ]);
    });

    it("retains multiple original order pairs and order self-loops without connecting different runs", async () => {
        const sources = ["first", "second"].map((id) =>
            source(id, ["/a", "/a", "/b"], ["one", "one", "two"]),
        );
        const { model } = await derived(sources);
        expect(model.counts.orderEdges).toBe(1);
        expect(model.counts.orderLinks).toBe(2);
        const edge = model.edges[0];
        expect(edge.kind).toBe("observation_order");
        expect(edge.source).toBe(edge.target);
        expect(
            edge.orderLinks.every((link) => link.source.run === "one" && link.target.run === "one"),
        ).toBe(true);
    });

    it("keeps deterministic identifiers and provenance while preserving inputs", async () => {
        const sources = ["first", "second"].map((id) => source(id, ["/a", "/b", "/c"]));
        for (const item of sources) {
            addExecution(item, "execution", 0, 1);
        }
        const before = originalEvidence(sources);
        const { preview, model } = await derived(sources);
        const previewBefore = canonical(preview);
        const repeated = buildDerivedModel(
            { ...preview, groups: [...preview.groups].reverse() },
            [...sources].reverse(),
        );
        expect(repeated).toEqual(model);
        expect(originalEvidence(sources)).toBe(before);
        expect(canonical(preview)).toBe(previewBefore);
        expect(model.counts.completedExecutions + model.counts.unlinkedExecutions).toBe(2);
    });
});
