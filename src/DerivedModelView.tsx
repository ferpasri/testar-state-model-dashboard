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
import { filterDerivedModel } from "./derived-filter";
import { DEFAULT_RENDERING, DerivedRenderControls } from "./DerivedRenderControls";
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
    const [focus, setFocus] = useState({ node: model.nodes[0]?.id ?? "", edge: "" });
    const [options, setOptions] = useState(DEFAULT_RENDERING);
    const [showOnlySelected, setShowOnlySelected] = useState(false);
    const [showOrderLinks, setShowOrderLinks] = useState(true);
    const [sourceFilter, setSourceFilter] = useState("all");
    const [runFilter, setRunFilter] = useState("all");
    const [nodeLimit, setNodeLimit] = useState(50);
    const [edgeLimit, setEdgeLimit] = useState(50);
    const [unlinkedLimit, setUnlinkedLimit] = useState(20);
    const scopedModel = useMemo(
        () => filterDerivedModel(model, { source: sourceFilter, run: runFilter }),
        [model, sourceFilter, runFilter],
    );
    const highlighting = sourceFilter !== "all" || runFilter !== "all";
    const displayModel = showOnlySelected && highlighting ? scopedModel : model;
    const edges = useMemo(
        () => displayModel.edges.filter((edge) => showOrderLinks || edge.kind === "execution"),
        [displayModel, showOrderLinks],
    );
    // Keep the graph window independent of rendering filters so positions remain comparable.
    const window = useMemo(
        () => derivedWindow(model.nodes, model.edges, focus.node, focus.edge),
        [model, focus],
    );
    const windowNodeIds = useMemo(
        () => new Set(window.nodes.map((item) => item.id)),
        [window.nodes],
    );
    const windowEdgeIds = useMemo(
        () => new Set(window.edges.map((item) => item.id)),
        [window.edges],
    );
    const selectNode = useCallback(
        (id: string) => {
            setSelectedNode(id);
            setSelectedEdge("");
            if (!windowNodeIds.has(id)) {
                setFocus({ node: id, edge: "" });
            }
        },
        [windowNodeIds],
    );
    const selectEdge = useCallback(
        (id: string) => {
            setSelectedEdge(id);
            setSelectedNode("");
            if (!windowEdgeIds.has(id)) {
                setFocus({ node: "", edge: id });
            }
        },
        [windowEdgeIds],
    );
    const highlighted = useMemo(
        () => ({
            nodes: new Set(scopedModel.nodes.map((node) => node.id)),
            edges: new Set(scopedModel.edges.map((edge) => edge.id)),
        }),
        [scopedModel],
    );
    const visibleNodes = useMemo(
        () => new Set(displayModel.nodes.map((node) => node.id)),
        [displayModel],
    );
    const visibleEdges = useMemo(() => new Set(edges.map((edge) => edge.id)), [edges]);
    const visibleNodeCount = window.nodes.filter((node) => visibleNodes.has(node.id)).length;
    const visibleEdgeCount = window.edges.filter((edge) => visibleEdges.has(edge.id)).length;
    const dimmedOpacity = (100 - options.dimOtherEvidence) / 100;
    const selected = edges.find((edge) => edge.id === selectedEdge);
    const node = displayModel.nodes.find((item) => item.id === selectedNode);
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
                <label className="compact-toggle">
                    <input
                        type="checkbox"
                        checked={showOnlySelected}
                        onChange={(event) => setShowOnlySelected(event.target.checked)}
                    />
                    Show only selected source/run
                </label>
                {highlighting && (
                    <p className="muted">
                        Highlighted: {highlighted.nodes.size} states / {highlighted.edges.size}{" "}
                        links.{" "}
                        {showOnlySelected
                            ? "Only supporting evidence is shown."
                            : "Other evidence remains visible."}
                    </p>
                )}
            </div>
            <DerivedRenderControls options={options} onChange={setOptions} />
            {showOnlySelected && highlighting && (
                <p className="derived-scope-summary notice">
                    Selected source/run: {displayModel.nodes.length} states,{" "}
                    {displayModel.counts.observations} visits,{" "}
                    {displayModel.counts.completedExecutions} completed executions. Counts and
                    inspection below use this selection; model downloads retain the complete model.
                </p>
            )}
            {(visibleNodeCount < displayModel.nodes.length || visibleEdgeCount < edges.length) && (
                <p className="notice">
                    Graph window: {visibleNodeCount} of {displayModel.nodes.length} states and{" "}
                    {visibleEdgeCount} of {edges.length} links. Select any state or transition in
                    the lists to bring its endpoints into view.
                </p>
            )}
            <div className="derived-layout">
                <div className="derived-main">
                    <Suspense fallback={<p className="notice">Preparing derived graph...</p>}>
                        <DerivedGraph
                            nodes={window.nodes}
                            edges={window.edges}
                            displayModel={displayModel}
                            visibleNodes={visibleNodes}
                            visibleEdges={visibleEdges}
                            options={options}
                            selectedNode={node?.id ?? ""}
                            selectedEdge={selected?.id ?? ""}
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
                            <h3>States ({displayModel.nodes.length})</h3>
                            <div className="derived-list">
                                {displayModel.nodes.slice(0, nodeLimit).map((item) => (
                                    <button
                                        className={
                                            "derived-node" +
                                            (highlighting && !highlighted.nodes.has(item.id)
                                                ? " not-highlighted"
                                                : "")
                                        }
                                        style={{
                                            opacity:
                                                highlighting && !highlighted.nodes.has(item.id)
                                                    ? dimmedOpacity
                                                    : 1,
                                        }}
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
                            {displayModel.nodes.length > nodeLimit && (
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
                                        style={{
                                            opacity:
                                                highlighting && !highlighted.edges.has(edge.id)
                                                    ? dimmedOpacity
                                                    : 1,
                                        }}
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
                    {displayModel.unlinkedExecutions.length > 0 && (
                        <details className="matching-panel derived-unlinked">
                            <summary>
                                Executions without a connected result (
                                {displayModel.unlinkedExecutions.length})
                            </summary>
                            {displayModel.unlinkedExecutions.slice(0, unlinkedLimit).map((item) => (
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
                            {displayModel.unlinkedExecutions.length > unlinkedLimit && (
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
                    model={displayModel}
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
