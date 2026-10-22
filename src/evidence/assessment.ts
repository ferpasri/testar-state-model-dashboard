import type { Check } from "./schema";
import { objectValue } from "./property-evidence";

export type AssessmentPhase = "during_run" | "end_of_run";

export interface AssessmentContext {
    phase: AssessmentPhase;
    semantics?: "open_ended" | "recorded_interval";
    terminationReason?: string;
}

function phase(value: unknown): AssessmentPhase | undefined {
    return value === "during_run" || value === "end_of_run" ? value : undefined;
}

export function assessmentContext(check: Check): AssessmentContext | undefined {
    const standard = objectValue(check.details["evidence.assessment"]);
    const standardPhase = phase(standard?.phase);
    if (
        standardPhase &&
        (standard?.semantics === "open_ended" || standard?.semantics === "recorded_interval")
    ) {
        return {
            phase: standardPhase,
            semantics: standard.semantics,
            ...(standardPhase === "end_of_run" && typeof standard.termination_reason === "string"
                ? { terminationReason: standard.termination_reason }
                : {}),
        };
    }
    const nativePhase = phase(check.details["bombadil.assessment_phase"]);
    if (!nativePhase) {
        return undefined;
    }
    const reason = check.details["bombadil.termination_reason"];
    return {
        phase: nativePhase,
        ...(nativePhase === "end_of_run" && typeof reason === "string"
            ? { terminationReason: reason }
            : {}),
    };
}
