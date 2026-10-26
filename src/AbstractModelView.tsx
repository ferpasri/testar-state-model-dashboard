import { lazy, Suspense, useCallback, useMemo, useState } from "react";
import type {
    AbstractModel,
    EvidenceReference,
    ExecutionReference,
    AbstractionPreview,
} from "testar-abstraction";
import { runKey } from "testar-abstraction";
import { abstractModelWindow, evidenceLabel } from "./abstract-model-presentation";
import { actionModelGraph } from "./abstract-action-presentation";
import { AbstractActionsPanel } from "./AbstractActionsPanel";
import { AbstractModelInspector } from "./AbstractModelInspector";
import { filterAbstractModel } from "./abstract-model-filter";
import { DEFAULT_RENDERING, AbstractModelRenderControls } from "./AbstractModelRenderControls";
import type { ImportedSource } from "./evidence/import";

const AbstractModelGraph = lazy(() =>
    import("./AbstractModelGraph").then((module) => ({ default: module.AbstractModelGraph })),
);

interface Props {
    model: AbstractModel;
    preview: AbstractionPreview;
    sources: ImportedSource[];
    active: boolean;
    onOpenObservation: (reference: EvidenceReference) => void;
    onOpenExecution: (reference: ExecutionReference) => void;
    onInspectGroup: (id: string) => void;
}

export function AbstractModelView({
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
    const [selectedAction, setSelectedAction] = useState("");
    const [showAvailableActions, setShowAvailableActions] = useState(true);
    const [groupUnknownOutcomes, setGroupUnknownOutcomes] = useState(false);
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
        () => filterAbstractModel(model, { source: sourceFilter, run: runFilter }),
        [model, sourceFilter, runFilter],
    );
    const graphModel = useMemo(
        () => actionModelGraph(model, undefined, groupUnknownOutcomes),
        [model, groupUnknownOutcomes],
    );
    const unknownActions = useMemo(
        () => new Set(graphModel.nodes.flatMap((node) => node.outcomeActions ?? [])),
        [graphModel],
    );
    const scopedGraph = useMemo(
        () => actionModelGraph(scopedModel, unknownActions, groupUnknownOutcomes),
        [scopedModel, unknownActions, groupUnknownOutcomes],
    );
    const highlighting = sourceFilter !== "all" || runFilter !== "all";
    const displayModel = showOnlySelected && highlighting ? scopedModel : model;
    const displayGraph = showOnlySelected && highlighting ? scopedGraph : graphModel;
    const edges = useMemo(
        () => displayModel.edges.filter((edge) => showOrderLinks || edge.kind === "execution"),
        [displayModel, showOrderLinks],
    );
    // Keep the graph window independent of rendering filters so positions remain comparable.
    const window = useMemo(
        () => abstractModelWindow(graphModel.nodes, graphModel.edges, focus.node, focus.edge),
        [graphModel, focus],
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
            setSelectedAction("");
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
            setSelectedAction("");
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
            nodes: new Set(scopedGraph.nodes.map((node) => node.id)),
            edges: new Set(scopedGraph.edges.map((edge) => edge.id)),
        }),
        [scopedGraph],
    );
    const visibleNodes = useMemo(
        () =>
            new Set(
                displayGraph.nodes
                    .filter((node) => showAvailableActions || !node.outcomeActions)
                    .map((node) => node.id),
            ),
        [displayGraph, showAvailableActions],
    );
    const visibleEdges = useMemo(
        () =>
            new Set(
                displayGraph.edges
                    .filter(
                        (edge) =>
                            (showAvailableActions ||
                                (!edge.outcomeAction && !edge.outcomeActions)) &&
                            (showOrderLinks || edge.kind === "execution"),
                    )
                    .map((edge) => edge.id),
            ),
        [displayGraph, showAvailableActions, showOrderLinks],
    );
    const virtualAction = displayGraph.edges.find(
        (item) => item.id === selectedEdge,
    )?.outcomeAction;
    const selectedOutcomes = showAvailableActions
        ? (displayGraph.nodes.find((item) => item.id === selectedNode)?.outcomeActions ??
          displayGraph.edges.find((item) => item.id === selectedEdge)?.outcomeActions)
        : undefined;
    const selectedOutcomeIds = new Set(selectedOutcomes);
    const outcomeActions = selectedOutcomes
        ? displayModel.actionEvidence?.actions.filter((item) => selectedOutcomeIds.has(item.id))
        : undefined;
    const action = displayModel.actionEvidence?.actions.find(
        (item) => item.id === (selectedAction || (showAvailableActions ? virtualAction : "")),
    );
    function selectAction(id: string) {
        setSelectedAction(id);
        setSelectedNode("");
        setSelectedEdge("");
        const sourceNode = model.actionEvidence?.actions.find((item) => item.id === id)?.sourceNode;
        if (sourceNode && !windowNodeIds.has(sourceNode)) {
            setFocus({ node: sourceNode, edge: "" });
        }
    }
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
        <section className="abstract-model-workspace" aria-label="Abstract model">
            <p className="muted">
                Abstraction rules: "{preview.definition.name}". Model paths may combine different
                test runs; highlight a run to inspect its recorded evidence.
            </p>
            <div className="abstract-model-summary">
                <span>{model.nodes.length} states</span>
                {model.actionEvidence && (
                    <span>{model.actionEvidence.actions.length} abstract actions</span>
                )}
                <span>{model.counts.completedExecutions} completed executions</span>
                <span>{model.counts.unlinkedExecutions} executions without a connected result</span>
                <span>{model.counts.unmatchedNodes} unmatched observations</span>
            </div>
            <div className="model-tools">
                <div className="abstract-model-controls abstraction-panel">
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
                                .filter(
                                    (run) => sourceFilter === "all" || run.source === sourceFilter,
                                )
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
                            checked={showAvailableActions}
                            onChange={(event) => setShowAvailableActions(event.target.checked)}
                        />
                        Show actions with unobserved outcomes
                    </label>
                    <label className="compact-toggle">
                        <input
                            type="checkbox"
                            checked={groupUnknownOutcomes}
                            onChange={(event) => setGroupUnknownOutcomes(event.target.checked)}
                        />
                        Group unknown-outcome links by state
                    </label>
                    <label className="compact-toggle">
                        <input
                            type="checkbox"
                            checked={showOrderLinks}
                            onChange={(event) => {
                                setShowOrderLinks(event.target.checked);
                                if (
                                    !event.target.checked &&
                                    selected?.kind === "observation_order"
                                ) {
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
                <details className="render-options">
                    <summary>Rendering options</summary>
                    <AbstractModelRenderControls options={options} onChange={setOptions} />
                </details>
            </div>
            {showOnlySelected && highlighting && (
                <p className="abstract-model-scope-summary notice">
                    Selected source/run: {displayModel.nodes.length} states,{" "}
                    {displayModel.counts.observations} observations,{" "}
                    {displayModel.counts.completedExecutions} completed executions. Counts and
                    inspection below use this selection; model downloads retain the complete model.
                </p>
            )}
            {(visibleNodeCount < visibleNodes.size || visibleEdgeCount < visibleEdges.size) && (
                <p className="notice">
                    Graph window: {visibleNodeCount} of {visibleNodes.size} graph nodes and{" "}
                    {visibleEdgeCount} of {visibleEdges.size} links. Select any state or transition
                    in the lists to bring its endpoints into view.
                </p>
            )}
            <div className="abstract-model-layout">
                <div className="abstract-model-main">
                    <Suspense
                        fallback={<p className="notice">Preparing abstract model graph...</p>}
                    >
                        <AbstractModelGraph
                            nodes={window.nodes}
                            edges={window.edges}
                            displayModel={displayGraph}
                            visibleNodes={visibleNodes}
                            visibleEdges={visibleEdges}
                            options={options}
                            selectedNode={visibleNodes.has(selectedNode) ? selectedNode : ""}
                            selectedEdge={visibleEdges.has(selectedEdge) ? selectedEdge : ""}
                            highlightedNodes={highlighted.nodes}
                            highlightedEdges={highlighted.edges}
                            highlighting={highlighting}
                            active={active}
                            onSelectNode={selectNode}
                            onSelectEdge={selectEdge}
                        />
                    </Suspense>
                    <AbstractActionsPanel
                        model={displayModel}
                        selectedAction={action?.id ?? ""}
                        onSelectAction={selectAction}
                        onOpenObservation={onOpenObservation}
                        onOpenExecution={onOpenExecution}
                    />
                    <div className="abstract-model-lists">
                        <section className="abstraction-panel">
                            <h3>States ({displayModel.nodes.length})</h3>
                            <div className="abstract-model-list">
                                {displayModel.nodes.slice(0, nodeLimit).map((item) => (
                                    <button
                                        className={
                                            "abstract-model-node" +
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
                                            {item.members.length} observations
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
                        <section className="abstraction-panel">
                            <h3>Transitions and order links ({edges.length})</h3>
                            <div className="abstract-model-list">
                                {edges.slice(0, edgeLimit).map((edge) => (
                                    <button
                                        className={
                                            "abstract-model-edge" +
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
                        <details className="abstraction-panel abstract-model-unlinked">
                            <summary>
                                Executions without a connected result (
                                {displayModel.unlinkedExecutions.length})
                            </summary>
                            {displayModel.unlinkedExecutions.slice(0, unlinkedLimit).map((item) => (
                                <article
                                    className="abstract-model-execution"
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
                <AbstractModelInspector
                    action={action}
                    outcomeActions={outcomeActions}
                    onSelectAction={selectAction}
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
