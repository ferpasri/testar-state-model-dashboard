import type { OracleResult } from "./schema";
import { objectValue } from "./property-evidence";
export type AssessmentPhase = "during_run" | "end_of_run" | "during_sequence" | "end_of_sequence";
export interface AssessmentContext {
    phase: AssessmentPhase;
    semantics: "open_ended" | "recorded_interval";
    terminationReason?: string;
}
export function assessmentContext(result: OracleResult): AssessmentContext | undefined {
    const value = objectValue(result.oracle_details["evidence.assessment"]);
    if (
        !value ||
        !["during_run", "end_of_run", "during_sequence", "end_of_sequence"].includes(
            String(value.phase),
        ) ||
        !["open_ended", "recorded_interval"].includes(String(value.semantics))
    ) {
        return undefined;
    }
    return {
        phase: value.phase as AssessmentPhase,
        semantics: value.semantics as AssessmentContext["semantics"],
        ...(typeof value.termination_reason === "string"
            ? { terminationReason: value.termination_reason }
            : {}),
    };
}
