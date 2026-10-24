import { expect, test } from "vitest";
import { assessmentContext } from "../src/evidence/assessment";
import type { OracleResult } from "../src/evidence/schema";

function report(details: Record<string, unknown>): OracleResult {
    return {
        test_run: "run",
        test_sequence: "sequence",
        name: "Condition",
        oracle: { id: "rule" },
        oracle_status: "pending",
        oracle_target: {
            target_type: "observation_range",
            first_observation: "first",
            last_observation: "last",
        },
        oracle_details: details,
    };
}

test("shared assessments expose phase semantics and reported termination without changing outcomes", () => {
    const check = report({
        "evidence.assessment": {
            phase: "end_of_run",
            semantics: "open_ended",
            termination_reason: "deadline",
        },
    });
    const before = structuredClone(check);
    expect(assessmentContext(check)).toEqual({
        phase: "end_of_run",
        semantics: "open_ended",
        terminationReason: "deadline",
    });
    expect(check).toEqual(before);
    expect(check.oracle_status).toBe("pending");
});

test("native phase context supplies no inferred temporal semantics", () => {
    expect(
        assessmentContext(
            report({
                "producer.assessment_phase": "end_of_run",
                "producer.termination_reason": "interrupted",
            }),
        ),
    ).toBeUndefined();
    expect(assessmentContext(report({}))).toBeUndefined();
});

test("valid shared context takes priority and malformed optional context stays uninterpreted", () => {
    expect(
        assessmentContext(
            report({
                "evidence.assessment": { phase: "during_run", semantics: "recorded_interval" },
                "producer.assessment_phase": "end_of_run",
            }),
        ),
    ).toEqual({ phase: "during_run", semantics: "recorded_interval" });
    expect(
        assessmentContext(report({ "evidence.assessment": { phase: "end_of_run" } })),
    ).toBeUndefined();
    expect(
        assessmentContext(
            report({ "evidence.assessment": { phase: "end_of_run", semantics: "maybe" } }),
        ),
    ).toBeUndefined();
});
