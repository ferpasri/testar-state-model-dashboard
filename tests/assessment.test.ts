import { expect, test } from "vitest";
import { assessmentContext } from "../src/evidence/assessment";
import type { Check } from "../src/evidence/schema";

function report(details: Record<string, unknown>): Check {
    return {
        run: "run",
        name: "Condition",
        rule: { id: "rule" },
        status: "pending",
        target: { kind: "sequence", from_observation: "first", to_observation: "last" },
        details,
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
    expect(check.status).toBe("pending");
});

test("native phase context supplies no inferred temporal semantics", () => {
    expect(
        assessmentContext(
            report({
                "bombadil.assessment_phase": "end_of_run",
                "bombadil.termination_reason": "interrupted",
            }),
        ),
    ).toEqual({ phase: "end_of_run", terminationReason: "interrupted" });
    expect(assessmentContext(report({}))).toBeUndefined();
});

test("valid shared context takes priority and malformed optional context stays uninterpreted", () => {
    expect(
        assessmentContext(
            report({
                "evidence.assessment": { phase: "during_run", semantics: "recorded_interval" },
                "bombadil.assessment_phase": "end_of_run",
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
