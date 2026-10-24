import { propertyGroups } from "./property-evidence";
import type { ReconstructedEvidence } from "./reconstructed-evidence";
import type { Observation } from "./schema";

export interface WidgetCoverage {
    results: number;
    properties: Map<string, number>;
}

export interface ObservationCoverage {
    directResults: number;
    observationResults: number;
    detailedResults: number;
    stateProperties: Map<string, number>;
    widgets: Map<string, WidgetCoverage>;
}

function emptyCoverage(): ObservationCoverage {
    return {
        directResults: 0,
        observationResults: 0,
        detailedResults: 0,
        stateProperties: new Map(),
        widgets: new Map(),
    };
}

export function evaluationCoverage(
    evidence: ReconstructedEvidence,
): Map<string, ObservationCoverage> {
    const index = new Map<string, ObservationCoverage>();
    for (const { data } of evidence.oracleResults) {
        const target = data.oracle_target;
        if (!("observation" in target)) {
            continue;
        }
        let coverage = index.get(target.observation);
        if (!coverage) {
            coverage = emptyCoverage();
            index.set(target.observation, coverage);
        }
        coverage.directResults++;
        if (target.target_type === "observation") {
            coverage.observationResults++;
        } else {
            coverage.detailedResults++;
        }
        if (target.target_type === "state_property") {
            coverage.stateProperties.set(
                target.property,
                (coverage.stateProperties.get(target.property) ?? 0) + 1,
            );
        }
        if (target.target_type === "widget" || target.target_type === "widget_property") {
            let widget = coverage.widgets.get(target.widget);
            if (!widget) {
                widget = { results: 0, properties: new Map() };
                coverage.widgets.set(target.widget, widget);
            }
            widget.results++;
            if (target.target_type === "widget_property") {
                widget.properties.set(
                    target.property,
                    (widget.properties.get(target.property) ?? 0) + 1,
                );
            }
        }
    }
    return index;
}

export function coverageForObservation(
    index: Map<string, ObservationCoverage>,
    observation: Observation,
): ObservationCoverage {
    return index.get(observation.id) ?? emptyCoverage();
}

export function propertiesWithoutResults(
    properties: Record<string, unknown>,
    results: Map<string, number>,
): string[] {
    return propertyGroups(properties, results)
        .filter((group) => group.results === 0)
        .map((group) => group.name);
}
