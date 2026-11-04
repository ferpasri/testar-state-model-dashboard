import { readFileSync } from "node:fs";
import path from "node:path";
import { abstractionActionCase } from "./support";
import { describe, expect, it } from "vitest";
import {
    buildAbstractModel,
    previewAbstraction,
    parseAbstractionRules,
    runKey,
    type EvidenceInput,
    type AnalysisSource,
} from "testar-abstraction";
import { actionModelGraph } from "../src/abstract-action-presentation";
import { filterAbstractModel } from "../src/abstract-model-filter";
import { abstractModelWindow } from "../src/abstract-model-presentation";
import { DASHBOARD_PRESETS } from "../src/action-presets";

type WireEvidence = {
    [K in keyof EvidenceInput]: Array<EvidenceInput[K] extends Map<string, infer V> ? V : never>;
};
async function fixture(name = "available-and-executed") {
    const directory = abstractionActionCase(name);
    const input = JSON.parse(readFileSync(path.join(directory, "input.json"), "utf8")) as {
        sources: Array<{ id: string; label: string; fingerprint: string; evidence: WireEvidence }>;
        selected_runs: Array<{ source: string; run: string }>;
    };
    const sources: AnalysisSource[] = input.sources.map((source) => ({
        ...source,
        evidence: {
            runs: new Map(source.evidence.runs.map((item) => [item.id, item])),
            sequences: new Map(source.evidence.sequences.map((item) => [item.id, item])),
            observations: new Map(source.evidence.observations.map((item) => [item.id, item])),
            actions: new Map(source.evidence.actions.map((item) => [item.id, item])),
            executions: new Map(
                source.evidence.executions.map((item) => [item.execution.id, item]),
            ),
        },
    }));
    const rules = parseAbstractionRules(readFileSync(path.join(directory, "rules.json"), "utf8"));
    const preview = await previewAbstraction(
        sources,
        rules,
        input.selected_runs.map((item) => runKey(item.source, item.run)),
    );
    return buildAbstractModel(preview, sources);
}

describe("abstract action presentation", () => {
    it("renders only unobserved outcomes as placeholders without changing the exported model", async () => {
        const model = await fixture();
        const before = JSON.stringify(model);
        const graph = actionModelGraph(model);
        expect(model.actionEvidence!.actions).toHaveLength(5);
        expect(graph.nodes.filter((node) => node.outcomeActions)).toHaveLength(1);
        expect(graph.nodes.find((node) => node.outcomeActions)!.outcomeActions).toHaveLength(3);
        expect(
            new Set(graph.edges.filter((edge) => edge.outcomeAction).map((edge) => edge.target))
                .size,
        ).toBe(1);
        expect(graph.edges.filter((edge) => edge.outcomeAction)).toHaveLength(3);
        expect(
            graph.nodes
                .filter((node) => node.outcomeActions)
                .every((node) => node.members.length === 0),
        ).toBe(true);
        expect(graph.counts).toEqual(model.counts);
        expect(JSON.stringify(model)).toBe(before);
    });
    it("filters availability support and keeps positions comparable when another source supplied an outcome", async () => {
        const model = await fixture();
        const graph = actionModelGraph(model);
        const allowed = new Set(
            graph.edges.flatMap((edge) => (edge.outcomeAction ? [edge.outcomeAction] : [])),
        );
        const alpha = filterAbstractModel(model, { source: "alpha", run: runKey("alpha", "run") });
        expect(alpha.actionEvidence!.actions).toHaveLength(5);
        expect(alpha.actionEvidence!.actions.flatMap((action) => action.executions)).toHaveLength(
            1,
        );
        expect(
            alpha
                .actionEvidence!.actions.flatMap((action) => action.availability)
                .every((item) => item.reference.source === "alpha"),
        ).toBe(true);
        const scopedGraph = actionModelGraph(alpha, allowed);
        expect(
            scopedGraph.nodes.filter((node) => node.outcomeActions).map((node) => node.id),
        ).toEqual(graph.nodes.filter((node) => node.outcomeActions).map((node) => node.id));
        expect(model.actionEvidence!.actions.flatMap((action) => action.executions)).toHaveLength(
            2,
        );
    });
    it("keeps failed attempts separate from a known resulting state", async () => {
        const model = await fixture("execution-statuses");
        model.edges = [];
        expect(actionModelGraph(model).nodes.filter((node) => node.outcomeActions)).toHaveLength(1);
    });
    it("preserves unmatched diagnostics and recorded availability links during filtering", async () => {
        const model = await fixture("ambiguous-targets");
        const beta = filterAbstractModel(model, { source: "beta", run: "all" });
        expect(beta.actionEvidence!.actions).toEqual([]);
        expect(beta.actionEvidence!.unmatchedExecutions).toHaveLength(1);
        expect(beta.actionEvidence!.unmatchedExecutions[0].possibleActionIds).toHaveLength(1);
        expect(
            filterAbstractModel(model, { source: "alpha", run: "all" }).actionEvidence!
                .unmatchedExecutions,
        ).toEqual([]);
    });
    it("keeps a selected outcome marker within the bounded graph window", async () => {
        const graph = actionModelGraph(await fixture());
        const selected = graph.edges.find((edge) => edge.outcomeAction)!;
        const window = abstractModelWindow(graph.nodes, graph.edges, "", selected.id);
        expect(
            window.nodes.some((node) => node.id === selected.target && node.outcomeActions),
        ).toBe(true);
    });
    it("groups unknown-outcome links by state only when requested", async () => {
        const model = await fixture();
        const before = JSON.stringify(model);
        const individual = actionModelGraph(model);
        const grouped = actionModelGraph(model, undefined, true);
        expect(individual.edges.filter((edge) => edge.outcomeAction)).toHaveLength(3);
        const links = grouped.edges.filter((edge) => edge.outcomeActions);
        expect(links).toHaveLength(1);
        expect(links[0].label).toBe("3 actions without observed outcomes");
        expect(links[0].outcomeActions).toEqual(
            individual.edges.flatMap((edge) => (edge.outcomeAction ? [edge.outcomeAction] : [])),
        );
        expect(grouped.nodes).toEqual(individual.nodes);
        expect(grouped.counts).toEqual(model.counts);
        expect(JSON.stringify(model)).toBe(before);
    });
    it("retains separate grouped links for different source states", async () => {
        const model = await fixture("actions-scoped-by-state");
        model.edges = [];
        const links = actionModelGraph(model, undefined, true).edges.filter(
            (edge) => edge.outcomeActions,
        );
        expect(links).toHaveLength(2);
        expect(new Set(links.map((edge) => edge.source)).size).toBe(2);
        expect(new Set(links.map((edge) => edge.target)).size).toBe(1);
        expect(links.every((edge) => edge.outcomeActions!.length === 1)).toBe(true);
    });
    it("keeps grouped links scoped to reporting sources", async () => {
        const model = await fixture();
        const allowed = new Set(
            actionModelGraph(model).nodes.flatMap((node) => node.outcomeActions ?? []),
        );
        const beta = filterAbstractModel(model, { source: "beta", run: "all" });
        for (const grouping of [false, true]) {
            const scoped = actionModelGraph(beta, allowed, grouping);
            expect(
                scoped.edges.filter((edge) => edge.outcomeAction || edge.outcomeActions),
            ).toEqual([]);
            expect(scoped.nodes.filter((node) => node.outcomeActions)).toEqual([]);
        }
        const alpha = filterAbstractModel(model, { source: "alpha", run: "all" });
        const link = actionModelGraph(alpha, allowed, true).edges.find(
            (edge) => edge.outcomeActions,
        )!;
        expect(link.outcomeActions).toHaveLength(3);
    });
    it("validates the action preset as explicit shared-language rules", () => {
        const preset = DASHBOARD_PRESETS.find(
            (item) => item.name === "Page address and available actions",
        )!;
        expect(
            parseAbstractionRules(JSON.stringify(preset.definition)).actions?.target,
        ).toHaveLength(2);
    });
});
