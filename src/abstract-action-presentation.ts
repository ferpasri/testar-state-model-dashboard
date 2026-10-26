import type {
    AbstractAction,
    AbstractModel,
    AbstractModelNode,
    AbstractModelEdge,
} from "testar-abstraction";

export type ModelGraphNode = AbstractModelNode & { outcomeActions?: string[] };
export type ModelGraphEdge = AbstractModelEdge & {
    outcomeAction?: string;
    outcomeActions?: string[];
};
export type ModelGraph = Omit<AbstractModel, "nodes" | "edges"> & {
    nodes: ModelGraphNode[];
    edges: ModelGraphEdge[];
};

export function actionLabel(action: AbstractAction): string {
    const comparison = action.comparison as { target?: Array<{ reading?: { value?: unknown } }> };
    const values =
        comparison.target
            ?.map((field) => field.reading?.value)
            .filter((value): value is string => typeof value === "string" && value.length > 0) ??
        [];
    return [action.actionType, ...values].join(" / ").slice(0, 160);
}

export function actionModelGraph(
    model: AbstractModel,
    allowedOutcomes?: Set<string>,
    groupByState = false,
): ModelGraph {
    const nodes: ModelGraphNode[] = [...model.nodes];
    const edges: ModelGraphEdge[] = [...model.edges];
    const knownOutcomes = new Set(
        model.edges.flatMap((edge) => (edge.abstractAction ? [edge.abstractAction] : [])),
    );
    const outcomeActions: string[] = [];
    const nodeId = "unobserved-outcome";
    for (const action of model.actionEvidence?.actions ?? []) {
        if (
            !action.availability.length ||
            knownOutcomes.has(action.id) ||
            (allowedOutcomes && !allowedOutcomes.has(action.id))
        ) {
            continue;
        }
        outcomeActions.push(action.id);
        edges.push({
            id: "available-action:" + action.id,
            kind: "execution",
            source: action.sourceNode,
            target: nodeId,
            label: actionLabel(action),
            actionType: actionLabel(action),
            executions: [],
            orderLinks: [],
            outcomeAction: action.id,
        });
    }
    // The shared marker describes missing evidence, rather than a recorded or abstract state.
    if (outcomeActions.length) {
        nodes.push({ id: nodeId, label: "Outcome not observed", members: [], outcomeActions });
    }
    return { ...model, nodes, edges: groupByState ? groupOutcomeLinks(edges) : edges };
}

function groupOutcomeLinks(edges: ModelGraphEdge[]): ModelGraphEdge[] {
    const result: ModelGraphEdge[] = [];
    const grouped = new Map<string, ModelGraphEdge>();
    for (const edge of edges) {
        if (!edge.outcomeAction) {
            result.push(edge);
            continue;
        }
        let group = grouped.get(edge.source);
        if (!group) {
            group = {
                ...edge,
                id: "available-actions:" + edge.source,
                outcomeAction: undefined,
                outcomeActions: [],
            };
            grouped.set(edge.source, group);
            result.push(group);
        }
        group.outcomeActions!.push(edge.outcomeAction);
        const count = group.outcomeActions!.length;
        group.label =
            count +
            (count === 1
                ? " action without an observed outcome"
                : " actions without observed outcomes");
        group.actionType = group.label;
    }
    return result;
}
