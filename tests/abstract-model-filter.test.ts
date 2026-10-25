import { describe, expect, it } from "vitest";
import {
    runKey,
    type AbstractModelEdge,
    type AbstractModel,
    type AbstractModelNode,
    type EvidenceReference,
    type ExecutionReference,
} from "../src/analysis";
import { edgeLabel } from "../src/analysis/abstractModelLabels";
import { filterAbstractModel } from "../src/abstract-model-filter";

function observation(source: string, id: string, run = "run"): EvidenceReference {
    return { source, run, observation: id };
}

function execution(source: string, id: string, run = "run"): ExecutionReference {
    return { source, run, execution: id };
}

function node(id: string, members: EvidenceReference[], diagnostic = false): AbstractModelNode {
    return diagnostic
        ? { id, label: id, members, unmatchedReason: "The selected property was unavailable." }
        : { id, label: id, groupId: id, members };
}

function actionEdge(
    id: string,
    from: string,
    to: string,
    executions: ExecutionReference[],
): AbstractModelEdge {
    return {
        id,
        kind: "execution",
        source: from,
        target: to,
        label: edgeLabel("click", executions.length),
        actionType: "click",
        executions,
        orderLinks: [],
    };
}

function fixture(): AbstractModel {
    return {
        nodes: [
            node("home", [
                observation("a", "home"),
                observation("a", "home-after"),
                observation("b", "home"),
                observation("c", "home"),
                observation("c", "home-after"),
            ]),
            node("shared", [observation("a", "shared"), observation("b", "shared")]),
            node("a-branch", [observation("a", "branch")]),
            node("b-branch", [observation("b", "branch")]),
            node("c-branch", [observation("c", "branch")]),
            node("diagnostic", [observation("a", "unknown")], true),
        ],
        edges: [
            actionEdge("to-shared", "home", "shared", [
                execution("a", "same"),
                execution("b", "same"),
            ]),
            actionEdge("to-a", "shared", "a-branch", [execution("a", "branch")]),
            actionEdge("to-b", "shared", "b-branch", [execution("b", "branch")]),
            actionEdge("to-c", "home", "c-branch", [execution("c", "same")]),
            actionEdge("loop", "home", "home", [execution("a", "loop"), execution("c", "loop")]),
            actionEdge("to-diagnostic", "a-branch", "diagnostic", [execution("a", "unknown")]),
            {
                id: "order",
                kind: "observation_order",
                source: "home",
                target: "shared",
                label: edgeLabel("Observation order", 2),
                executions: [],
                orderLinks: [
                    { source: observation("a", "home"), target: observation("a", "shared") },
                    { source: observation("b", "home"), target: observation("b", "shared") },
                ],
            },
        ],
        unlinkedExecutions: [
            {
                reference: execution("a", "pending"),
                sourceNode: "home",
                status: "awaiting_execution_result",
                reason: "No execution result recorded.",
            },
            {
                reference: execution("b", "pending"),
                sourceNode: "shared",
                status: "awaiting_resulting_observation",
                reason: "No result recorded.",
            },
            {
                reference: execution("c", "pending"),
                sourceNode: "c-branch",
                status: "failed",
                reason: "Rejected by the tool.",
            },
            {
                reference: execution("a", "incomplete"),
                sourceNode: "diagnostic",
                status: "incomplete",
                reason: "Run interrupted.",
            },
        ],
        counts: {
            matchedNodes: 5,
            unmatchedNodes: 1,
            observations: 11,
            executionEdges: 6,
            completedExecutions: 8,
            unlinkedExecutions: 4,
            orderEdges: 1,
            orderLinks: 2,
        },
    };
}

describe("abstract model source and run filtering", () => {
    it("preserves all supported evidence when source and run are unrestricted", () => {
        const original = fixture();
        expect(filterAbstractModel(original, { source: "all", run: "all" })).toEqual(original);
    });

    it("keeps only a source's original members and supported branches through shared states", () => {
        const filtered = filterAbstractModel(fixture(), { source: "a", run: "all" });
        expect(filtered.nodes.map((item) => item.id)).toEqual([
            "home",
            "shared",
            "a-branch",
            "diagnostic",
        ]);
        expect(
            filtered.nodes
                .flatMap((item) => item.members)
                .every((reference) => reference.source === "a"),
        ).toBe(true);
        expect(filtered.edges.map((edge) => edge.id)).toEqual([
            "to-shared",
            "to-a",
            "loop",
            "to-diagnostic",
            "order",
        ]);
        expect(filtered.counts).toEqual({
            matchedNodes: 3,
            unmatchedNodes: 1,
            observations: 5,
            executionEdges: 4,
            completedExecutions: 4,
            unlinkedExecutions: 2,
            orderEdges: 1,
            orderLinks: 1,
        });
    });

    it("uses source-scoped run identity despite repeated run, observation, and execution names", () => {
        const filtered = filterAbstractModel(fixture(), { source: "all", run: runKey("b", "run") });
        expect(filtered.nodes.map((item) => item.id)).toEqual(["home", "shared", "b-branch"]);
        expect(filtered.nodes.flatMap((item) => item.members)).toEqual([
            observation("b", "home"),
            observation("b", "shared"),
            observation("b", "branch"),
        ]);
        expect(filtered.edges.find((edge) => edge.id === "to-shared")?.executions).toEqual([
            execution("b", "same"),
        ]);
        expect(filtered.unlinkedExecutions).toEqual([
            {
                reference: execution("b", "pending"),
                sourceNode: "shared",
                status: "awaiting_resulting_observation",
                reason: "No result recorded.",
            },
        ]);
    });

    it("combines source and run restrictions instead of treating either as sufficient", () => {
        const filtered = filterAbstractModel(fixture(), { source: "a", run: runKey("b", "run") });
        expect(filtered.nodes).toEqual([]);
        expect(filtered.edges).toEqual([]);
        expect(filtered.unlinkedExecutions).toEqual([]);
        expect(Object.values(filtered.counts).every((count) => count === 0)).toBe(true);
    });

    it("updates aggregate labels and counts from the retained provenance", () => {
        const original = fixture();
        const filtered = filterAbstractModel(original, { source: "a", run: "all" });
        const shared = filtered.edges.find((edge) => edge.id === "to-shared")!;
        expect(shared.id).toBe("to-shared");
        expect(shared.actionType).toBe("click");
        expect(shared.label).toBe("click");
        expect(shared.executions).toEqual([execution("a", "same")]);
        expect(original.edges.find((edge) => edge.id === "to-shared")!.executions).toHaveLength(2);
        expect(filtered.edges.find((edge) => edge.id === "order")!.label).toBe("Observation order");
    });

    it("does not infer edge support just because both endpoint states have selected members", () => {
        const original = fixture();
        original.edges.find((edge) => edge.id === "to-shared")!.executions = [
            execution("b", "same"),
        ];
        const filtered = filterAbstractModel(original, { source: "a", run: "all" });
        expect(filtered.nodes.some((item) => item.id === "home")).toBe(true);
        expect(filtered.nodes.some((item) => item.id === "shared")).toBe(true);
        expect(filtered.edges.some((edge) => edge.id === "to-shared")).toBe(false);
    });

    it("requires both endpoint nodes even when an execution reference matches the selected source", () => {
        const original = fixture();
        original.edges.push(
            actionEdge("unsupported-endpoint", "home", "b-branch", [execution("a", "other")]),
        );
        const filtered = filterAbstractModel(original, { source: "a", run: "all" });
        expect(filtered.nodes.some((item) => item.id === "b-branch")).toBe(false);
        expect(filtered.edges.some((edge) => edge.id === "unsupported-endpoint")).toBe(false);
    });

    it("retains self-loop execution provenance while removing other sources' contributions", () => {
        const filtered = filterAbstractModel(fixture(), { source: "c", run: "all" });
        const loop = filtered.edges.find((edge) => edge.id === "loop")!;
        expect(loop.source).toBe("home");
        expect(loop.target).toBe("home");
        expect(loop.executions).toEqual([execution("c", "loop")]);
        expect(filtered.counts).toMatchObject({
            observations: 3,
            executionEdges: 2,
            completedExecutions: 2,
            orderEdges: 0,
            orderLinks: 0,
        });
    });

    it("keeps only order pairs whose endpoints belong to the same selected original source and run", () => {
        const original = fixture();
        const order = original.edges.find((edge) => edge.id === "order")!;
        order.orderLinks.push(
            { source: observation("a", "home"), target: observation("b", "shared") },
            { source: observation("a", "home"), target: observation("a", "shared", "other") },
        );
        const unrestricted = filterAbstractModel(original, { source: "all", run: "all" });
        expect(unrestricted.edges.find((edge) => edge.id === "order")!.orderLinks).toHaveLength(2);
        const selected = filterAbstractModel(original, { source: "a", run: "all" });
        expect(selected.edges.find((edge) => edge.id === "order")!.orderLinks).toEqual([
            {
                source: observation("a", "home"),
                target: observation("a", "shared"),
            },
        ]);
    });

    it("distinguishes two runs of the same source", () => {
        const original = fixture();
        original.nodes.push(node("second-run", [observation("a", "second", "other")]));
        original.edges.push(
            actionEdge("second-loop", "second-run", "second-run", [
                execution("a", "second-run-execution", "other"),
            ]),
        );
        const filtered = filterAbstractModel(original, { source: "a", run: runKey("a", "other") });
        expect(filtered.nodes.map((item) => item.id)).toEqual(["second-run"]);
        expect(filtered.edges.map((edge) => edge.id)).toEqual(["second-loop"]);
        expect(filtered.counts).toMatchObject({
            observations: 1,
            completedExecutions: 1,
            unlinkedExecutions: 0,
        });
    });

    it("retains scoped unlinked executions even when no original observations were captured", () => {
        const original = fixture();
        original.nodes = [];
        original.edges = [];
        original.unlinkedExecutions = [
            {
                reference: execution("a", "without-node"),
                sourceNode: null,
                status: "awaiting_execution_result",
                reason: "No source observation.",
            },
            {
                reference: execution("a", "outside-node"),
                sourceNode: "uncaptured-original-id",
                status: "incomplete",
                reason: "No source observation.",
            },
            {
                reference: execution("b", "other"),
                sourceNode: null,
                status: "failed",
                reason: "Rejected.",
            },
        ];
        const filtered = filterAbstractModel(original, { source: "a", run: "all" });
        expect(filtered.nodes).toEqual([]);
        expect(filtered.edges).toEqual([]);
        expect(filtered.unlinkedExecutions.map((item) => item.sourceNode)).toEqual([
            null,
            "uncaptured-original-id",
        ]);
        expect(filtered.counts).toMatchObject({
            observations: 0,
            completedExecutions: 0,
            unlinkedExecutions: 2,
        });
    });

    it("returns an empty scoped model when no evidence matches", () => {
        const filtered = filterAbstractModel(fixture(), { source: "unknown", run: "all" });
        expect(filtered.nodes).toEqual([]);
        expect(filtered.edges).toEqual([]);
        expect(filtered.unlinkedExecutions).toEqual([]);
        expect(Object.values(filtered.counts)).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
    });

    it("keeps stable IDs and labels while returning independent provenance arrays and references", () => {
        const original = fixture();
        const before = JSON.stringify(original);
        const filtered = filterAbstractModel(original, { source: "a", run: "all" });
        expect(filtered.nodes[0].id).toBe(original.nodes[0].id);
        expect(filtered.nodes[0].label).toBe(original.nodes[0].label);
        expect(filtered.nodes[0].groupId).toBe(original.nodes[0].groupId);
        expect(filtered.nodes.find((item) => item.id === "diagnostic")!.unmatchedReason).toBe(
            original.nodes.find((item) => item.id === "diagnostic")!.unmatchedReason,
        );
        expect(filterAbstractModel(original, { source: "a", run: "all" })).toEqual(filtered);
        filtered.nodes[0].members[0].source = "changed";
        filtered.edges[0].executions[0].source = "changed";
        filtered.edges.find((edge) => edge.id === "order")!.orderLinks[0].source.source = "changed";
        filtered.unlinkedExecutions[0].reference.source = "changed";
        expect(JSON.stringify(original)).toBe(before);
    });
});
