import { propertyGroups } from "./property-evidence";
import type { EvidenceModel } from "./model";
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

export function evaluationCoverage(model: EvidenceModel): Map<string, ObservationCoverage> {
    const index = new Map<string, ObservationCoverage>();
    for (const { data } of model.checks) {
        const target = data.target;
        if (!("observation" in target)) {
            continue;
        }
        let coverage = index.get(target.observation);
        if (!coverage) {
            coverage = emptyCoverage();
            index.set(target.observation, coverage);
        }
        coverage.directResults++;
        if (target.kind === "observation") {
            coverage.observationResults++;
        } else {
            coverage.detailedResults++;
        }
        if (target.kind === "state_property") {
            coverage.stateProperties.set(
                target.property,
                (coverage.stateProperties.get(target.property) ?? 0) + 1,
            );
        }
        if (target.kind === "widget" || target.kind === "widget_property") {
            let widget = coverage.widgets.get(target.widget);
            if (!widget) {
                widget = { results: 0, properties: new Map() };
                coverage.widgets.set(target.widget, widget);
            }
            widget.results++;
            if (target.kind === "widget_property") {
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
