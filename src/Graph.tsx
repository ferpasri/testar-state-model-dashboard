import { useEffect, useMemo, useRef, useState } from "react";
import cytoscape from "cytoscape";
import type { EvidenceModel } from "./evidence/model";
import type { Observation } from "./evidence/schema";
import { displayValue } from "./evidence/common";
import type { ObservationGap } from "./evidence/trace";

export function Graph({
    model,
    observations,
    selected,
    onSelect,
    selectedExecution,
    onSelectExecution,
    gaps,
    selectedGap,
    onSelectGap,
}: {
    model: EvidenceModel;
    observations: Observation[];
    selected: string;
    onSelect: (id: string) => void;
    selectedExecution: string;
    onSelectExecution: (id: string) => void;
    gaps: ObservationGap[];
    selectedGap: string;
    onSelectGap: (id: string) => void;
}) {
    const container = useRef<HTMLDivElement>(null);
    const graph = useRef<cytoscape.Core | null>(null);
    const [showOrderLinks, setShowOrderLinks] = useState(true);
    const visibleGaps = useMemo(() => {
        const visible = new Set(observations.map((item) => item.id));
        return gaps.filter((gap) => visible.has(gap.source) && visible.has(gap.target));
    }, [gaps, observations]);
    useEffect(() => {
        if (!container.current) {
            return;
        }
        const identities = new Map(observations.map((item, index) => [item.id, "n" + index]));
        const elements: cytoscape.ElementDefinition[] = observations.map((item, index) => ({
            data: {
                id: "n" + index,
                observation: item.id,
                label:
                    item.sequence +
                    " · " +
                    displayValue(item.state.properties["ui.title"] ?? "Observation").slice(0, 55),
            },
        }));
        for (const [index, item] of Array.from(model.executions.values()).entries()) {
            if (
                item.result &&
                identities.has(item.execution.source) &&
                identities.has(item.result)
            ) {
                elements.push({
                    data: {
                        id: "e" + index,
                        execution: item.execution.id,
                        source: identities.get(item.execution.source),
                        target: identities.get(item.result),
                        label:
                            model.actions.get(item.execution.action)?.kind.slice(0, 35) ?? "action",
                    },
                });
            }
        }
        if (showOrderLinks) {
            for (const [index, gap] of visibleGaps.entries()) {
                elements.push({
                    classes: "observation-gap",
                    data: {
                        id: "g" + index,
                        gap: gap.id,
                        source: identities.get(gap.source),
                        target: identities.get(gap.target),
                        label: "Unknown / observation order",
                    },
                });
            }
        }
        const instance = cytoscape({
            container: container.current,
            elements,
            minZoom: 0.08,
            maxZoom: 2,
            layout: { name: "breadthfirst", directed: true, spacingFactor: 1.4, padding: 35 },
            style: [
                {
                    selector: "node",
                    style: {
                        shape: "round-rectangle",
                        width: 145,
                        height: 48,
                        label: "data(label)",
                        "font-size": 10,
                        "text-valign": "center",
                        "text-wrap": "wrap",
                        "text-max-width": "130px",
                        color: "#17434a",
                        "background-color": "#e5efeb",
                        "border-width": 1,
                        "border-color": "#a8c7bd",
                    },
                },
                {
                    selector: "edge",
                    style: {
                        width: 1.5,
                        "line-color": "#aac5be",
                        "target-arrow-color": "#aac5be",
                        "target-arrow-shape": "triangle",
                        "curve-style": "bezier",
                        label: "data(label)",
                        "font-size": 9,
                        "text-events": "yes",
                        color: "#53706f",
                        "text-background-color": "#fcfaf5",
                        "text-background-opacity": 1,
                        "text-background-padding": "3px",
                    },
                },
                {
                    selector: "edge.observation-gap",
                    style: {
                        "line-style": "dashed",
                        "line-color": "#8a9292",
                        "target-arrow-color": "#8a9292",
                        "target-arrow-fill": "hollow",
                        color: "#657070",
                    },
                },
                {
                    selector: "edge:selected",
                    style: {
                        width: 3.5,
                        "line-color": "#b76e4d",
                        "target-arrow-color": "#b76e4d",
                        color: "#823e2e",
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
            ],
        });
        graph.current = instance;
        instance.on("tap", "node", (event) => onSelect(event.target.data("observation")));
        instance.on("tap", "edge", (event) => {
            const gap = event.target.data("gap");
            if (typeof gap === "string") {
                onSelectGap(gap);
            } else {
                onSelectExecution(event.target.data("execution"));
            }
        });
        const observer = new ResizeObserver(() => instance.resize());
        observer.observe(container.current);
        instance.zoom(0.9);
        instance.center(instance.nodes().first());
        return () => {
            observer.disconnect();
            instance.destroy();
            graph.current = null;
        };
    }, [
        model,
        observations,
        onSelect,
        onSelectExecution,
        visibleGaps,
        showOrderLinks,
        onSelectGap,
    ]);
    useEffect(() => {
        const instance = graph.current;
        if (instance) {
            instance.elements().unselect();
            const selection =
                selectedGap && showOrderLinks
                    ? instance.edges().filter((edge) => edge.data("gap") === selectedGap)
                    : selectedExecution
                      ? instance
                            .edges()
                            .filter((edge) => edge.data("execution") === selectedExecution)
                      : instance.nodes().filter((node) => node.data("observation") === selected);
            if (selection.length === 0) {
                return;
            }
            selection.select();
            if (instance.zoom() < 0.65) {
                instance.zoom(0.9);
            }
            instance.center(selection);
        }
    }, [selected, selectedExecution, selectedGap, observations, showOrderLinks]);
    return (
        <section className="graph-panel" aria-label="Execution graph">
            <div className="panel-heading">
                <div>
                    <span className="eyebrow">CONCRETE TRACE</span>
                    <h2>Every visit, connected.</h2>
                </div>
                <div className="graph-options">
                    <label className="compact-toggle">
                        <input
                            type="checkbox"
                            checked={showOrderLinks}
                            onChange={(event) => {
                                setShowOrderLinks(event.target.checked);
                                if (!event.target.checked && selectedGap) {
                                    onSelectGap("");
                                }
                            }}
                        />
                        Show observation-order links
                    </label>
                    <button className="quiet" onClick={() => graph.current?.fit(undefined, 35)}>
                        Fit trace
                    </button>
                </div>
            </div>
            <div ref={container} className="graph" />
            <div className="graph-note">
                <span className="legend-dot" /> Observation <span className="legend-line" />{" "}
                Completed execution{" "}
                {showOrderLinks && visibleGaps.length > 0 && (
                    <>
                        <span className="legend-gap" /> Observation order only ({visibleGaps.length}
                        )
                    </>
                )}
                <span className="graph-hint">Scroll to zoom · Drag to explore</span>
            </div>
        </section>
    );
}
