import { useEffect, useRef, useState } from "react";
import cytoscape from "cytoscape";
import type { DerivedEdge, DerivedModel, DerivedNode } from "./analysis";
import type { ModelLayout, RenderingOptions } from "./DerivedRenderControls";

interface Props {
    nodes: DerivedNode[];
    edges: DerivedEdge[];
    displayModel: DerivedModel;
    visibleNodes: Set<string>;
    visibleEdges: Set<string>;
    selectedNode: string;
    selectedEdge: string;
    highlightedNodes: Set<string>;
    highlightedEdges: Set<string>;
    highlighting: boolean;
    options: RenderingOptions;
    active: boolean;
    onSelectNode: (id: string) => void;
    onSelectEdge: (id: string) => void;
}

function layoutOptions(layout: ModelLayout): cytoscape.LayoutOptions {
    if (layout === "hierarchical") {
        return {
            name: "breadthfirst",
            directed: true,
            spacingFactor: 1.5,
            padding: 40,
            animate: false,
        };
    }
    if (layout === "circular") {
        return {
            name: "circle",
            padding: 40,
            avoidOverlap: true,
            spacingFactor: 1.4,
            animate: false,
        };
    }
    return {
        name: "cose",
        padding: 40,
        animate: false,
        randomize: true,
        componentSpacing: 100,
        nodeRepulsion: () => 450000,
        idealEdgeLength: () => 150,
        edgeElasticity: () => 100,
        numIter: 400,
        initialTemp: 200,
        coolingFactor: 0.95,
        minTemp: 1,
    };
}

export function DerivedGraph({
    nodes,
    edges,
    displayModel,
    visibleNodes,
    visibleEdges,
    selectedNode,
    selectedEdge,
    highlightedNodes,
    highlightedEdges,
    highlighting,
    options,
    active,
    onSelectNode,
    onSelectEdge,
}: Props) {
    const container = useRef<HTMLDivElement>(null);
    const graph = useRef<cytoscape.Core | null>(null);
    const previousSelection = useRef("");
    const [layoutRevision, setLayoutRevision] = useState(0);
    useEffect(() => {
        if (!container.current) {
            return;
        }
        const identities = new Map(nodes.map((node, index) => [node.id, "dn" + index]));
        const elements: cytoscape.ElementDefinition[] = nodes.map((node, index) => ({
            classes: node.unmatchedReason ? "unmatched" : "",
            data: { id: "dn" + index, nodeId: node.id, renderLabel: "" },
        }));
        edges.forEach((edge, index) => {
            elements.push({
                classes: edge.kind === "observation_order" ? "order-link" : "",
                data: {
                    id: "de" + index,
                    edgeId: edge.id,
                    source: identities.get(edge.source),
                    target: identities.get(edge.target),
                    renderLabel: "",
                },
            });
        });
        const instance = cytoscape({
            container: container.current,
            elements,
            minZoom: 0.05,
            maxZoom: 3,
            layout: { name: "preset" },
            style: [
                {
                    selector: "node",
                    style: {
                        shape: "round-rectangle",
                        width: 160,
                        height: 62,
                        label: "data(renderLabel)",
                        "font-size": 10,
                        "text-valign": "center",
                        "text-wrap": "wrap",
                        "text-overflow-wrap": "anywhere",
                        "text-max-width": "145px",
                        color: "#17434a",
                        "background-color": "#e5efeb",
                        "border-width": 1,
                        "border-color": "#89aa9c",
                    },
                },
                {
                    selector: "node.unmatched",
                    style: {
                        "background-color": "#f0f1f2",
                        "border-color": "#8a9292",
                        "border-style": "dashed",
                    },
                },
                {
                    selector: "edge",
                    style: {
                        width: 2,
                        "line-color": "#82a79a",
                        "target-arrow-color": "#82a79a",
                        "target-arrow-shape": "triangle",
                        "curve-style": "bezier",
                        "loop-direction": "-45deg",
                        "loop-sweep": "65deg",
                        label: "data(renderLabel)",
                        "font-size": 9,
                        "text-events": "yes",
                        color: "#355d58",
                        "text-background-color": "#fcfaf5",
                        "text-background-opacity": 1,
                        "text-background-padding": "3px",
                    },
                },
                {
                    selector: "edge.order-link",
                    style: {
                        "line-style": "dashed",
                        "line-color": "#8a9292",
                        "target-arrow-color": "#8a9292",
                        "target-arrow-fill": "hollow",
                        color: "#657070",
                    },
                },
                {
                    selector: "node:selected",
                    style: {
                        "background-color": "#17434a",
                        color: "#ffffff",
                        "border-width": 3,
                        "border-color": "#d98460",
                    },
                },
                {
                    selector: "edge:selected",
                    style: {
                        width: 4,
                        "line-color": "#b76e4d",
                        "target-arrow-color": "#b76e4d",
                        color: "#823e2e",
                    },
                },
            ],
        });
        graph.current = instance;
        instance.on("tap", "node", (event) => onSelectNode(event.target.data("nodeId")));
        instance.on("tap", "edge", (event) => onSelectEdge(event.target.data("edgeId")));
        const observer = new ResizeObserver(() => instance.resize());
        observer.observe(container.current);
        return () => {
            observer.disconnect();
            instance.destroy();
            graph.current = null;
        };
    }, [nodes, edges, onSelectNode, onSelectEdge]);

    useEffect(() => {
        const instance = graph.current;
        if (!instance) {
            return;
        }
        const nodeDescriptions = new Map(displayModel.nodes.map((node) => [node.id, node]));
        const edgeDescriptions = new Map(displayModel.edges.map((edge) => [edge.id, edge]));
        const dimmedOpacity = (100 - options.dimOtherEvidence) / 100;
        instance.batch(() => {
            instance.nodes().forEach((element) => {
                const id = element.data("nodeId") as string;
                const node = nodeDescriptions.get(id);
                element.style("display", visibleNodes.has(id) ? "element" : "none");
                element.toggleClass("dimmed", highlighting && !highlightedNodes.has(id));
                element.style(
                    "opacity",
                    highlighting && !highlightedNodes.has(id) ? dimmedOpacity : 1,
                );
                element.data(
                    "renderLabel",
                    options.showStateLabels && node
                        ? node.label.slice(0, 80) + "\n" + node.members.length + " visits"
                        : "",
                );
            });
            instance.edges().forEach((element) => {
                const id = element.data("edgeId") as string;
                const edge = edgeDescriptions.get(id);
                element.style("display", visibleEdges.has(id) ? "element" : "none");
                element.toggleClass("dimmed", highlighting && !highlightedEdges.has(id));
                element.style(
                    "opacity",
                    highlighting && !highlightedEdges.has(id) ? dimmedOpacity : 1,
                );
                const name =
                    edge?.kind === "execution"
                        ? (edge.actionKind ?? "Action")
                        : "Observation order";
                const count =
                    edge?.kind === "execution"
                        ? edge.executions.length
                        : (edge?.orderLinks.length ?? 0);
                const parts = [];
                if (options.showActionLabels) {
                    parts.push(name.slice(0, 45));
                }
                if (options.showExecutionCounts) {
                    parts.push("(" + count + ")");
                }
                element.data("renderLabel", parts.join(" "));
            });
        });
    }, [
        displayModel,
        visibleNodes,
        visibleEdges,
        highlightedNodes,
        highlightedEdges,
        highlighting,
        options,
        nodes,
        edges,
    ]);

    useEffect(() => {
        const instance = graph.current;
        if (instance && instance.elements(":visible").nodes().length > 0) {
            instance.elements(":visible").layout(layoutOptions(options.layout)).run();
        }
    }, [options.layout, layoutRevision, nodes, edges]);

    useEffect(() => {
        const instance = graph.current;
        if (!instance) {
            return;
        }
        instance.elements().unselect();
        const selection = selectedEdge
            ? instance.edges().filter((edge) => edge.data("edgeId") === selectedEdge)
            : instance.nodes().filter((node) => node.data("nodeId") === selectedNode);
        selection.select();
        const identity = selectedEdge || selectedNode;
        if (
            active &&
            previousSelection.current &&
            previousSelection.current !== identity &&
            selection.length > 0
        ) {
            instance.zoom(Math.max(instance.zoom(), 0.75));
            instance.center(selection);
        }
        previousSelection.current = identity;
    }, [selectedNode, selectedEdge, nodes, edges, active]);

    useEffect(() => {
        if (active) {
            graph.current?.resize();
        }
    }, [active]);

    function fitVisible() {
        const instance = graph.current;
        if (instance && instance.elements(":visible").nodes().length > 0) {
            instance.fit(instance.elements(":visible"), 40);
        }
    }

    return (
        <section className="graph-panel" aria-label="Derived model graph">
            <div className="panel-heading">
                <div>
                    <span className="eyebrow">GROUPS AND RECORDED LINKS</span>
                    <h2>Derived state model</h2>
                </div>
                <div className="graph-options">
                    <button className="quiet" onClick={() => setLayoutRevision(layoutRevision + 1)}>
                        Reapply layout
                    </button>
                    <button className="quiet" onClick={fitVisible}>
                        Fit model
                    </button>
                </div>
            </div>
            <div
                className="derived-graph"
                ref={container}
                role="img"
                aria-label="Interactive model. States and transitions can also be selected in the lists below."
            />
            <div className="graph-note">
                <span className="legend-dot" /> State group
                <span className="legend-line" /> Recorded execution
                <span className="legend-gap" /> Observation order only
                <span className="graph-hint">Scroll to zoom / Drag to pan</span>
            </div>
        </section>
    );
}
