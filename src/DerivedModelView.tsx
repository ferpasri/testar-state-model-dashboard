import { lazy, Suspense, useCallback, useMemo, useState } from "react";
import type {
    DerivedModel,
    EvidenceReference,
    ExecutionReference,
    MatchingPreview,
} from "./analysis";
import { runKey } from "./analysis";
import { derivedWindow, evidenceLabel } from "./derived-presentation";
import { DerivedInspector } from "./DerivedInspector";
import type { ImportedSource } from "./evidence/import";

const DerivedGraph = lazy(() =>
    import("./DerivedGraph").then((module) => ({ default: module.DerivedGraph })),
);

interface Props {
    model: DerivedModel;
    preview: MatchingPreview;
    sources: ImportedSource[];
    active: boolean;
    onOpenObservation: (reference: EvidenceReference) => void;
    onOpenExecution: (reference: ExecutionReference) => void;
    onInspectGroup: (id: string) => void;
}

export function DerivedModelView({
    model,
    preview,
    sources,
    active,
    onOpenObservation,
    onOpenExecution,
    onInspectGroup,
}: Props) {
    const [selectedNode, setSelectedNode] = useState(model.nodes[0]?.id ?? "");
    const [selectedEdge, setSelectedEdge] = useState("");
    const [showOrderLinks, setShowOrderLinks] = useState(true);
    const [sourceFilter, setSourceFilter] = useState("all");
    const [runFilter, setRunFilter] = useState("all");
    const [nodeLimit, setNodeLimit] = useState(50);
    const [edgeLimit, setEdgeLimit] = useState(50);
    const [unlinkedLimit, setUnlinkedLimit] = useState(20);
    const selectNode = useCallback((id: string) => {
        setSelectedNode(id);
        setSelectedEdge("");
    }, []);
    const selectEdge = useCallback((id: string) => {
        setSelectedEdge(id);
        setSelectedNode("");
    }, []);
    const edges = useMemo(
        () => model.edges.filter((edge) => showOrderLinks || edge.kind === "execution"),
        [model, showOrderLinks],
    );
    const window = useMemo(
        () => derivedWindow(model.nodes, edges, selectedNode, selectedEdge),
        [model, edges, selectedNode, selectedEdge],
    );
    const highlighted = useMemo(() => {
        const supports = (reference: Pick<EvidenceReference, "source" | "run">) =>
            (sourceFilter === "all" || sourceFilter === reference.source) &&
            (runFilter === "all" || runFilter === runKey(reference.source, reference.run));
        return {
            nodes: new Set(
                model.nodes.filter((node) => node.members.some(supports)).map((node) => node.id),
            ),
            edges: new Set(
                model.edges
                    .filter(
                        (edge) =>
                            edge.executions.some(supports) ||
                            edge.orderLinks.some((link) => supports(link.source)),
                    )
                    .map((edge) => edge.id),
            ),
        };
    }, [model, sourceFilter, runFilter]);
    const highlighting = sourceFilter !== "all" || runFilter !== "all";
    const selected = edges.find((edge) => edge.id === selectedEdge);
    const node = model.nodes.find((item) => item.id === selectedNode);
    const labels = useMemo(
        () => new Map(model.nodes.map((item) => [item.id, item.label])),
        [model],
    );

    return (
        <section className="derived-workspace" aria-label="Derived model">
            <p className="muted">
                States follow the rule set "{preview.definition.name}". A path through merged states
                can combine different runs; inspect or highlight a run to identify its recorded
                evidence.
            </p>
            <div className="derived-summary">
                <span>{model.nodes.length} states</span>
                <span>{model.counts.completedExecutions} completed executions</span>
                <span>{model.counts.unlinkedExecutions} executions without a connected result</span>
                <span>{model.counts.unmatchedNodes} unmatched observations</span>
            </div>
            <div className="derived-controls matching-panel">
                <label className="search-label">
                    Highlight source
                    <select
                        aria-label="Highlight source"
                        value={sourceFilter}
                        onChange={(event) => {
                            setSourceFilter(event.target.value);
                            setRunFilter("all");
                        }}
                    >
                        <option value="all">All sources</option>
                        {preview.inputScope.sources.map((source) => (
                            <option key={source.id} value={source.id}>
                                {source.label}
                            </option>
                        ))}
                    </select>
                </label>
                <label className="search-label">
                    Highlight run
                    <select
                        aria-label="Highlight run"
                        value={runFilter}
                        onChange={(event) => setRunFilter(event.target.value)}
                    >
                        <option value="all">All runs</option>
                        {preview.inputScope.runs
                            .filter((run) => sourceFilter === "all" || run.source === sourceFilter)
                            .map((run) => (
                                <option
                                    value={runKey(run.source, run.run)}
                                    key={runKey(run.source, run.run)}
                                >
                                    {evidenceLabel(sources, run)}
                                </option>
                            ))}
                    </select>
                </label>
                <label className="compact-toggle">
                    <input
                        type="checkbox"
                        checked={showOrderLinks}
                        onChange={(event) => {
                            setShowOrderLinks(event.target.checked);
                            if (!event.target.checked && selected?.kind === "observation_order") {
                                setSelectedEdge("");
                            }
                        }}
                    />
                    Show observation-order links
                </label>
                {highlighting && (
                    <p className="muted">
                        Highlighted: {highlighted.nodes.size} states / {highlighted.edges.size}{" "}
                        links. Other evidence remains visible.
                    </p>
                )}
            </div>
            {(window.nodes.length < model.nodes.length || window.edges.length < edges.length) && (
                <p className="notice">
                    Graph window: {window.nodes.length} of {model.nodes.length} states and{" "}
                    {window.edges.length} of {edges.length} links. Select any state or transition in
                    the lists to bring its endpoints into view.
                </p>
            )}
            <div className="derived-layout">
                <div className="derived-main">
                    <Suspense fallback={<p className="notice">Preparing derived graph...</p>}>
                        <DerivedGraph
                            nodes={window.nodes}
                            edges={window.edges}
                            selectedNode={selectedNode}
                            selectedEdge={selectedEdge}
                            highlightedNodes={highlighted.nodes}
                            highlightedEdges={highlighted.edges}
                            highlighting={highlighting}
                            active={active}
                            onSelectNode={selectNode}
                            onSelectEdge={selectEdge}
                        />
                    </Suspense>
                    <div className="derived-lists">
                        <section className="matching-panel">
                            <h3>States ({model.nodes.length})</h3>
                            <div className="derived-list">
                                {model.nodes.slice(0, nodeLimit).map((item) => (
                                    <button
                                        className={
                                            "derived-node" +
                                            (highlighting && !highlighted.nodes.has(item.id)
                                                ? " not-highlighted"
                                                : "")
                                        }
                                        key={item.id}
                                        aria-pressed={item.id === selectedNode}
                                        onClick={() => selectNode(item.id)}
                                    >
                                        <strong>{item.label}</strong>
                                        <span>
                                            {item.members.length} visits
                                            {item.unmatchedReason ? " / unmatched" : ""}
                                        </span>
                                    </button>
                                ))}
                            </div>
                            {model.nodes.length > nodeLimit && (
                                <button
                                    className="quiet"
                                    onClick={() => setNodeLimit(nodeLimit + 50)}
                                >
                                    Show more states
                                </button>
                            )}
                        </section>
                        <section className="matching-panel">
                            <h3>Transitions and order links ({edges.length})</h3>
                            <div className="derived-list">
                                {edges.slice(0, edgeLimit).map((edge) => (
                                    <button
                                        className={
                                            "derived-edge" +
                                            (highlighting && !highlighted.edges.has(edge.id)
                                                ? " not-highlighted"
                                                : "")
                                        }
                                        data-kind={edge.kind}
                                        key={edge.id}
                                        aria-pressed={edge.id === selectedEdge}
                                        onClick={() => selectEdge(edge.id)}
                                    >
                                        <strong>{edge.label}</strong>
                                        <span>
                                            {labels.get(edge.source)} → {labels.get(edge.target)}
                                        </span>
                                        <span>
                                            {edge.kind === "execution"
                                                ? edge.executions.length + " executions"
                                                : edge.orderLinks.length +
                                                  " observation-order links"}
                                        </span>
                                    </button>
                                ))}
                            </div>
                            {edges.length > edgeLimit && (
                                <button
                                    className="quiet"
                                    onClick={() => setEdgeLimit(edgeLimit + 50)}
                                >
                                    Show more links
                                </button>
                            )}
                        </section>
                    </div>
                    {model.unlinkedExecutions.length > 0 && (
                        <details className="matching-panel derived-unlinked">
                            <summary>
                                Executions without a connected result (
                                {model.unlinkedExecutions.length})
                            </summary>
                            {model.unlinkedExecutions.slice(0, unlinkedLimit).map((item) => (
                                <article
                                    className="derived-execution"
                                    key={JSON.stringify(item.reference)}
                                >
                                    <strong>{evidenceLabel(sources, item.reference)}</strong>
                                    <p className="muted">
                                        {item.status} / {item.reason}
                                    </p>
                                    <button
                                        className="quiet"
                                        onClick={() => onOpenExecution(item.reference)}
                                    >
                                        Open original execution
                                    </button>
                                </article>
                            ))}
                            {model.unlinkedExecutions.length > unlinkedLimit && (
                                <button
                                    className="quiet"
                                    onClick={() => setUnlinkedLimit(unlinkedLimit + 20)}
                                >
                                    Show more executions
                                </button>
                            )}
                        </details>
                    )}
                </div>
                <DerivedInspector
                    node={node}
                    edge={selected}
                    model={model}
                    preview={preview}
                    sources={sources}
                    onOpenObservation={onOpenObservation}
                    onOpenExecution={onOpenExecution}
                    onInspectGroup={onInspectGroup}
                />
            </div>
        </section>
    );
}
