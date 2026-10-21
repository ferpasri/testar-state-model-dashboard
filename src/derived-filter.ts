import { runKey, type DerivedModel, type EvidenceReference } from "./analysis";
import { edgeLabel } from "./analysis/derivedLabels";

export interface DerivedScope {
    source: string;
    run: string;
}

export function filterDerivedModel(model: DerivedModel, scope: DerivedScope): DerivedModel {
    const selected = (reference: Pick<EvidenceReference, "source" | "run">) =>
        (scope.source === "all" || reference.source === scope.source) &&
        (scope.run === "all" || runKey(reference.source, reference.run) === scope.run);
    const nodes = model.nodes.flatMap((node) => {
        const members = node.members.filter(selected).map((reference) => ({ ...reference }));
        return members.length === 0 ? [] : [{ ...node, members }];
    });
    const nodeIds = new Set(nodes.map((node) => node.id));
    const edges = model.edges.flatMap((edge) => {
        if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) {
            return [];
        }
        const executions = edge.executions.filter(selected).map((reference) => ({ ...reference }));
        const orderLinks = edge.orderLinks
            .filter(
                (link) =>
                    selected(link.source) &&
                    selected(link.target) &&
                    link.source.source === link.target.source &&
                    link.source.run === link.target.run,
            )
            .map((link) => ({
                source: { ...link.source },
                target: { ...link.target },
            }));
        const count = edge.kind === "execution" ? executions.length : orderLinks.length;
        if (count === 0) {
            return [];
        }
        const label =
            edge.kind === "execution"
                ? edgeLabel(edge.actionKind ?? "Recorded execution", count)
                : edgeLabel("Observation order", count);
        return [{ ...edge, label, executions, orderLinks }];
    });
    const unlinkedExecutions = model.unlinkedExecutions
        .filter((execution) => selected(execution.reference))
        .map((execution) => ({ ...execution, reference: { ...execution.reference } }));
    return {
        nodes,
        edges,
        unlinkedExecutions,
        counts: {
            matchedNodes: nodes.filter((node) => node.groupId !== undefined).length,
            unmatchedNodes: nodes.filter((node) => node.groupId === undefined).length,
            observations: nodes.reduce((total, node) => total + node.members.length, 0),
            executionEdges: edges.filter((edge) => edge.kind === "execution").length,
            completedExecutions: edges.reduce(
                (total, edge) => total + (edge.kind === "execution" ? edge.executions.length : 0),
                0,
            ),
            unlinkedExecutions: unlinkedExecutions.length,
            orderEdges: edges.filter((edge) => edge.kind === "observation_order").length,
            orderLinks: edges.reduce(
                (total, edge) =>
                    total + (edge.kind === "observation_order" ? edge.orderLinks.length : 0),
                0,
            ),
        },
    };
}
