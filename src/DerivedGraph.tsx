import { useEffect, useRef } from "react";
import cytoscape from "cytoscape";
import type { DerivedEdge, DerivedNode } from "./analysis";

interface Props {
    nodes: DerivedNode[];
    edges: DerivedEdge[];
    selectedNode: string;
    selectedEdge: string;
    highlightedNodes: Set<string>;
    highlightedEdges: Set<string>;
    highlighting: boolean;
    active: boolean;
    onSelectNode: (id: string) => void;
    onSelectEdge: (id: string) => void;
}

export function DerivedGraph({
    nodes,
    edges,
    selectedNode,
    selectedEdge,
    highlightedNodes,
    highlightedEdges,
    highlighting,
    active,
    onSelectNode,
    onSelectEdge,
}: Props) {
    const container = useRef<HTMLDivElement>(null);
    const graph = useRef<cytoscape.Core | null>(null);
    const previousSelection = useRef("");
    useEffect(() => {
        if (!container.current) {
            return;
        }
        const identities = new Map(nodes.map((node, index) => [node.id, "dn" + index]));
        const elements: cytoscape.ElementDefinition[] = nodes.map((node, index) => ({
            classes: node.unmatchedReason ? "unmatched" : "",
            data: {
                id: "dn" + index,
                nodeId: node.id,
                label: node.label.slice(0, 80) + "\n" + node.members.length + " visits",
            },
        }));
        edges.forEach((edge, index) => {
            elements.push({
                classes: edge.kind === "observation_order" ? "order-link" : "",
                data: {
                    id: "de" + index,
                    edgeId: edge.id,
                    source: identities.get(edge.source),
                    target: identities.get(edge.target),
                    label:
                        (edge.kind === "execution"
                            ? (edge.actionKind ?? "Action")
                            : "Observation order"
                        ).slice(0, 45) +
                        " (" +
                        (edge.kind === "execution"
                            ? edge.executions.length
                            : edge.orderLinks.length) +
                        ")",
                },
            });
        });
        const instance = cytoscape({
            container: container.current,
            elements,
            minZoom: 0.05,
            maxZoom: 3,
            layout: {
                name: "breadthfirst",
                directed: true,
                spacingFactor: 1.5,
                padding: 40,
                animate: false,
            },
            style: [
                {
                    selector: "node",
                    style: {
                        shape: "round-rectangle",
                        width: 160,
                        height: 62,
                        label: "data(label)",
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
                        label: "data(label)",
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
                { selector: ".dimmed", style: { opacity: 0.18 } },
                {
                    selector: "node:selected",
                    style: {
                        "background-color": "#17434a",
                        color: "#ffffff",
                        "border-width": 3,
                        "border-color": "#d98460",
                        opacity: 1,
                    },
                },
                {
                    selector: "edge:selected",
                    style: {
                        width: 4,
                        "line-color": "#b76e4d",
                        "target-arrow-color": "#b76e4d",
                        color: "#823e2e",
                        opacity: 1,
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
        instance.batch(() => {
            instance.nodes().forEach((node) => {
                node.toggleClass(
                    "dimmed",
                    highlighting && !highlightedNodes.has(node.data("nodeId")),
                );
            });
            instance.edges().forEach((edge) => {
                edge.toggleClass(
                    "dimmed",
                    highlighting && !highlightedEdges.has(edge.data("edgeId")),
                );
            });
        });
    }, [highlightedNodes, highlightedEdges, highlighting, nodes, edges]);

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
            graph.current?.fit(undefined, 40);
        }
    }, [active, nodes, edges]);

    return (
        <section className="graph-panel" aria-label="Derived model graph">
            <div className="panel-heading">
                <div>
                    <span className="eyebrow">GROUPS AND RECORDED LINKS</span>
                    <h2>Derived state model</h2>
                </div>
                <button className="quiet" onClick={() => graph.current?.fit(undefined, 40)}>
                    Fit model
                </button>
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
                <span className="graph-hint">Scroll to zoom / Drag to explore</span>
            </div>
        </section>
    );
}
