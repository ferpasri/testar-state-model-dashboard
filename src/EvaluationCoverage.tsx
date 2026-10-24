import { compareIndex } from "./evidence/reconstructed-evidence";
import { useMemo, useState } from "react";
import { displayValue } from "./evidence/common";
import { CaptureDescription, PropertyCaptureInformation } from "./CaptureInformation";
import { propertyGroups } from "./evidence/property-evidence";
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
    const groups = propertyGroups(properties, results).filter(
        (group) => !onlyMissing || group.results === 0,
    );
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
            <p className="muted">
                {groups.length} captured properties shown; declared aliases are grouped.
            </p>
            <ul className="coverage-properties">
                {groups.slice(0, limit).map((group) => (
                    <li key={group.name}>
                        <div>
                            <code>{group.name}</code>
                            {group.aliases.length > 0 && (
                                <p className="muted">
                                    Also recorded as: {group.aliases.join(", ").slice(0, 4000)}
                                </p>
                            )}
                        </div>
                        <span
                            className={"badge " + (group.results > 0 ? "recorded" : "unrecorded")}
                        >
                            {group.results > 0
                                ? group.results + " results"
                                : "No recorded evaluation"}
                        </span>
                    </li>
                ))}
            </ul>
            <PropertyCaptureInformation properties={properties} />
            {groups.length > limit && (
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
    const index = useMemo(() => evaluationCoverage(source.evidence), [source.evidence]);
    const coverage = coverageForObservation(index, observation);
    const [runFilter, setRunFilter] = useState("no-direct");
    const [widgetFilter, setWidgetFilter] = useState("missing-properties");
    const [visitLimit, setVisitLimit] = useState(50);
    const [widgetLimit, setWidgetLimit] = useState(50);
    const visits = Array.from(source.evidence.observations.values())
        .filter((item) => item.test_sequence === observation.test_sequence)
        .sort((left, right) => compareIndex(left.observation_index, right.observation_index));
    const filteredVisits = visits.filter((item) => {
        const visit = coverageForObservation(index, item);
        return (
            runFilter === "all" ||
            (runFilter === "no-direct" ? visit.directResults === 0 : visit.detailedResults === 0)
        );
    });
    const widgets = observation.recorded_state.widgets.filter((widget) => {
        const result = coverage.widgets.get(widget.id);
        return (
            widgetFilter === "all" ||
            (widgetFilter === "no-results"
                ? !result
                : propertiesWithoutResults(widget.properties, result?.properties ?? new Map())
                      .length > 0)
        );
    });
    const missingWidgets = observation.recorded_state.widgets.filter(
        (widget) => !coverage.widgets.has(widget.id),
    ).length;
    const missingStateProperties = propertiesWithoutResults(
        observation.recorded_state.properties,
        coverage.stateProperties,
    ).length;
    return (
        <section aria-label="Recorded evaluation coverage">
            <p className="notice">
                No recorded evaluation means this evidence contains no result targeting that item.
                An oracle may have run without reporting it. Counts include every reported status,
                including pending and error.
            </p>
            <h3>Observation {observation.observation_index}</h3>
            <p className="muted">
                {coverage.observationResults} observation-level results; {coverage.detailedResults}{" "}
                widget/property results. Broad results do not evaluate every property.
            </p>
            <p className="muted">
                {missingWidgets} of {observation.recorded_state.widgets.length} captured widgets
                have no direct result. {missingStateProperties} of{" "}
                {propertyGroups(observation.recorded_state.properties).length} state properties have
                no property result.
            </p>
            {observation.recorded_state.capture !== "complete" && (
                <p className="notice">
                    Capture is {observation.recorded_state.capture}. Coverage describes the
                    available captured data.
                </p>
            )}
            <CaptureDescription properties={observation.recorded_state.properties} />
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
                            Observation {item.observation_index}: {result.observationResults}{" "}
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
                properties={observation.recorded_state.properties}
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
                {widgets.length} widgets match. Property targets retain their recorded names; valid
                same-record aliases share coverage.
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
                The lists group declared aliases and exclude the three shared capture-description
                metadata fields. Nested objects count as one property; their fields are not
                expanded. Evaluations of absent or uncaptured properties remain visible in
                Evaluations.
            </p>
        </section>
    );
}
