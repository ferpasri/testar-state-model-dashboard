import { canonical, EvidenceError, requireEvidence, safePath } from "./common";
import type { Check, Observation } from "./schema";
import type { EvidenceModel } from "./model";

export function validateObservation(model: EvidenceModel, observation: Observation): void {
    const state = observation.state;
    const widgets = new Map(state.widgets.map((item) => [item.id, item]));
    requireEvidence(widgets.size === state.widgets.length, "Duplicate widget ID.");
    requireEvidence(
        state.capture !== "unavailable" || widgets.size === 0,
        "Unavailable capture cannot contain widgets.",
    );
    const completed = new Set<string>();
    for (const widget of widgets.values()) {
        const ancestry = new Set<string>();
        let current: typeof widget | undefined = widget;
        while (current && !completed.has(current.id)) {
            requireEvidence(!ancestry.has(current.id), "Widget hierarchy contains a cycle.");
            ancestry.add(current.id);
            if (current.parent === null) {
                break;
            }
            requireEvidence(widgets.has(current.parent), "Widget parent is missing.");
            current = widgets.get(current.parent);
        }
        for (const id of ancestry) {
            completed.add(id);
        }
    }
    const candidates = new Set<string>();
    for (const candidate of observation.candidates) {
        requireEvidence(model.actions.has(candidate.action), "Candidate action is undefined.");
        requireEvidence(
            candidate.target === null || widgets.has(candidate.target),
            "Candidate widget is missing.",
        );
        const key = canonical(candidate);
        requireEvidence(!candidates.has(key), "Duplicate action candidate.");
        candidates.add(key);
    }
    const artifacts = new Set<string>();
    for (const artifact of observation.artifacts) {
        safePath(artifact.path);
        requireEvidence(!artifacts.has(artifact.id), "Duplicate artifact ID.");
        artifacts.add(artifact.id);
    }
}

export function validateCheck(model: EvidenceModel, check: Check): void {
    requireEvidence(model.runs.has(check.run), "Check references an unknown run.");
    const invalid = (field: string): never => {
        throw new EvidenceError(
            "Check target must identify evidence in its enclosing run: " + field,
            "invalid_check_target",
            field,
        );
    };
    const observation = (id: string, field: string): Observation => {
        const record = model.observations.get(id);
        if (!record || record.run !== check.run) {
            invalid(field);
        }
        return record!;
    };
    const target = check.target;
    switch (target.kind) {
        case "run":
            break;
        case "observation":
        case "state_property":
            observation(target.observation, "target.observation");
            break;
        case "widget":
        case "widget_property": {
            const record = observation(target.observation, "target.observation");
            if (!record.state.widgets.some((widget) => widget.id === target.widget)) {
                invalid("target.widget");
            }
            break;
        }
        case "execution":
            if (model.executions.get(target.execution)?.execution.run !== check.run) {
                invalid("target.execution");
            }
            break;
        case "sequence": {
            const start = observation(target.from_observation, "target.from_observation");
            const end = observation(target.to_observation, "target.to_observation");
            if (end.sequence < start.sequence) {
                invalid("target.to_observation");
            }
            break;
        }
    }
}
