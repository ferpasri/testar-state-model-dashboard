import type { AnalysisSource, DerivedEdge, DerivedNode, EvidenceReference } from "./analysis";

export function evidenceLabel(
    sources: AnalysisSource[],
    reference: Pick<EvidenceReference, "source" | "run">,
) {
    const source = sources.find((item) => item.id === reference.source);
    const run = source?.evidence.runs.get(reference.run);
    return (
        (source?.label ?? reference.source) +
        " / " +
        (run?.producer ?? "Unknown producer") +
        " / " +
        (run?.source_run ?? reference.run)
    );
}

export function derivedWindow(
    nodes: DerivedNode[],
    edges: DerivedEdge[],
    selectedNode: string,
    selectedEdge: string,
) {
    const nodeLimit = 500;
    const edgeLimit = 2000;
    if (nodes.length <= nodeLimit && edges.length <= edgeLimit) {
        return { nodes, edges };
    }
    const selected = edges.find((edge) => edge.id === selectedEdge);
    const pending = selected
        ? [selected.source, selected.target]
        : selectedNode
          ? [selectedNode]
          : nodes.slice(0, 1).map((node) => node.id);
    const adjacent = new Map<string, string[]>();
    for (const edge of edges) {
        const outgoing = adjacent.get(edge.source) ?? [];
        outgoing.push(edge.target);
        adjacent.set(edge.source, outgoing);
        const incoming = adjacent.get(edge.target) ?? [];
        incoming.push(edge.source);
        adjacent.set(edge.target, incoming);
    }
    const ids = new Set<string>();
    const queued = new Set(pending);
    let cursor = 0;
    while (cursor < pending.length && ids.size < nodeLimit) {
        const id = pending[cursor++];
        if (!ids.has(id)) {
            ids.add(id);
            for (const neighbor of adjacent.get(id) ?? []) {
                if (queued.size < nodeLimit && !queued.has(neighbor)) {
                    queued.add(neighbor);
                    pending.push(neighbor);
                }
            }
        }
    }
    for (const node of nodes) {
        if (ids.size === nodeLimit) {
            break;
        }
        ids.add(node.id);
    }
    const visibleEdges = edges.filter((edge) => ids.has(edge.source) && ids.has(edge.target));
    if (selected) {
        visibleEdges.sort(
            (left, right) => Number(right.id === selected.id) - Number(left.id === selected.id),
        );
    }
    return {
        nodes: nodes.filter((node) => ids.has(node.id)),
        edges: visibleEdges.slice(0, edgeLimit),
    };
}
