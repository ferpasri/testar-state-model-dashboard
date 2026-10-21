import { useMemo, useState } from "react";
import { displayValue } from "./evidence/common";
import {
    coverageForObservation,
    evaluationCoverage,
    propertiesWithoutResults,
} from "./evidence/coverage";
import type { ImportedSource } from "./evidence/import";
import type { Observation } from "./evidence/schema";

function PropertyCoverage({
    properties,
    results,
}: {
    properties: Record<string, unknown>;
    results: Map<string, number>;
}) {
    const [onlyMissing, setOnlyMissing] = useState(true);
    const [limit, setLimit] = useState(50);
    const names = Object.keys(properties).filter((name) => !onlyMissing || !results.has(name));
    return (
        <div className="property-coverage">
            <label className="compact-toggle">
                <input
                    type="checkbox"
                    checked={onlyMissing}
                    onChange={(event) => {
                        setOnlyMissing(event.target.checked);
                        setLimit(50);
                    }}
                />
                Only properties without recorded evaluations
            </label>
            <p className="muted">{names.length} captured properties shown.</p>
            <ul className="coverage-properties">
                {names.slice(0, limit).map((name) => (
                    <li key={name}>
                        <code>{name}</code>
                        <span
                            className={"badge " + (results.has(name) ? "recorded" : "unrecorded")}
                        >
                            {results.has(name)
                                ? results.get(name) + " results"
                                : "No recorded evaluation"}
                        </span>
                    </li>
                ))}
            </ul>
            {names.length > limit && (
                <button className="quiet" onClick={() => setLimit((value) => value + 50)}>
                    Show more properties
                </button>
            )}
        </div>
    );
}

export function EvaluationCoverage({
    source,
    observation,
    onSelectObservation,
}: {
    source: ImportedSource;
    observation: Observation;
    onSelectObservation: (id: string) => void;
}) {
    const index = useMemo(() => evaluationCoverage(source.model), [source.model]);
    const coverage = coverageForObservation(index, observation);
    const [runFilter, setRunFilter] = useState("no-direct");
    const [widgetFilter, setWidgetFilter] = useState("missing-properties");
    const [visitLimit, setVisitLimit] = useState(50);
    const [widgetLimit, setWidgetLimit] = useState(50);
    const visits = Array.from(source.model.observations.values())
        .filter((item) => item.run === observation.run)
        .sort((left, right) => left.sequence - right.sequence);
    const filteredVisits = visits.filter((item) => {
        const visit = coverageForObservation(index, item);
        return (
            runFilter === "all" ||
            (runFilter === "no-direct" ? visit.directResults === 0 : visit.detailedResults === 0)
        );
    });
    const widgets = observation.state.widgets.filter((widget) => {
        const result = coverage.widgets.get(widget.id);
        return (
            widgetFilter === "all" ||
            (widgetFilter === "no-results"
                ? !result
                : propertiesWithoutResults(widget.properties, result?.properties ?? new Map())
                      .length > 0)
        );
    });
    const missingWidgets = observation.state.widgets.filter(
        (widget) => !coverage.widgets.has(widget.id),
    ).length;
    const missingStateProperties = propertiesWithoutResults(
        observation.state.properties,
        coverage.stateProperties,
    ).length;
    return (
        <section aria-label="Recorded evaluation coverage">
            <p className="notice">
                No recorded evaluation means this evidence contains no result targeting that item.
                An oracle may have run without reporting it. Counts include every reported status,
                including pending and error.
            </p>
            <h3>Observation {observation.sequence}</h3>
            <p className="muted">
                {coverage.observationResults} observation-level results; {coverage.detailedResults}{" "}
                widget/property results. Broad results do not evaluate every property.
            </p>
            <p className="muted">
                {missingWidgets} of {observation.state.widgets.length} captured widgets have no
                direct result. {missingStateProperties} of{" "}
                {Object.keys(observation.state.properties).length} state properties have no property
                result.
            </p>
            {observation.state.capture !== "complete" && (
                <p className="notice">
                    Capture is {observation.state.capture}. Coverage describes the available
                    captured data.
                </p>
            )}
            <h3>Visits in this run</h3>
            <label className="search-label">
                Run coverage
                <select
                    aria-label="Run coverage"
                    value={runFilter}
                    onChange={(event) => {
                        setRunFilter(event.target.value);
                        setVisitLimit(50);
                    }}
                >
                    <option value="no-direct">Without any direct evaluation results</option>
                    <option value="no-detailed">Without widget/property results</option>
                    <option value="all">All visits</option>
                </select>
            </label>
            <p className="muted">
                {filteredVisits.length} of {visits.length} visits match.
            </p>
            <div className="coverage-visits">
                {filteredVisits.slice(0, visitLimit).map((item) => {
                    const result = coverageForObservation(index, item);
                    return (
                        <button
                            key={item.id}
                            className="quiet"
                            onClick={() => onSelectObservation(item.id)}
                        >
                            Observation {item.sequence}: {result.observationResults}{" "}
                            observation-level, {result.detailedResults} widget/property results
                        </button>
                    );
                })}
            </div>
            {filteredVisits.length > visitLimit && (
                <button className="quiet" onClick={() => setVisitLimit((value) => value + 50)}>
                    Show more visits
                </button>
            )}
            <h3>Captured state properties</h3>
            <PropertyCoverage
                key={source.id + observation.id + ":state"}
                properties={observation.state.properties}
                results={coverage.stateProperties}
            />
            <h3>Captured widgets</h3>
            <label className="search-label">
                Widget coverage
                <select
                    aria-label="Widget coverage"
                    value={widgetFilter}
                    onChange={(event) => {
                        setWidgetFilter(event.target.value);
                        setWidgetLimit(50);
                    }}
                >
                    <option value="missing-properties">
                        With properties lacking evaluation results
                    </option>
                    <option value="no-results">Without any direct evaluation results</option>
                    <option value="all">All captured widgets</option>
                </select>
            </label>
            <p className="muted">
                {widgets.length} widgets match. Property names are matched exactly as recorded;
                aliases are separate keys.
            </p>
            {widgets.slice(0, widgetLimit).map((widget) => {
                const result = coverage.widgets.get(widget.id);
                return (
                    <details className="widget" key={source.id + observation.id + widget.id}>
                        <summary>
                            {displayValue(
                                widget.properties["ui.name"] ??
                                    widget.properties["ui.text"] ??
                                    widget.properties["ui.role"] ??
                                    widget.id,
                            ).slice(0, 100) || widget.id}
                            {" · "}
                            {result?.results ?? 0} direct results
                            {" · "}
                            {
                                propertiesWithoutResults(
                                    widget.properties,
                                    result?.properties ?? new Map(),
                                ).length
                            }{" "}
                            properties without results
                        </summary>
                        <p className="muted">Widget: {widget.id}</p>
                        <PropertyCoverage
                            properties={widget.properties}
                            results={result?.properties ?? new Map()}
                        />
                    </details>
                );
            })}
            {widgets.length > widgetLimit && (
                <button className="quiet" onClick={() => setWidgetLimit((value) => value + 50)}>
                    Show more widgets
                </button>
            )}
            <p className="muted">
                The lists cover captured properties. Evaluations of absent or uncaptured properties
                remain visible in Evaluations.
            </p>
        </section>
    );
}
