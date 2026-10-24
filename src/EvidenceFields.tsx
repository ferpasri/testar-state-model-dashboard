import { assessmentContext } from "./evidence/assessment";
import { formatJson } from "./evidence/common";
import type { OracleResult } from "./evidence/schema";

export function Properties({ values }: { values: Record<string, unknown> }) {
    return (
        <dl className="properties">
            {Object.entries(values).map(([name, value]) => (
                <div key={name}>
                    <dt>{name}</dt>
                    <dd>
                        {(typeof value === "string" ? value : formatJson(value))?.slice(
                            0,
                            12_000,
                        ) ?? "Not supplied"}
                    </dd>
                </div>
            ))}
        </dl>
    );
}

export function Evaluation({
    data,
    runFinished,
    runReason,
}: {
    data: OracleResult;
    runFinished: boolean;
    runReason?: string;
}) {
    const assessment = assessmentContext(data);
    const descriptions: Record<OracleResult["oracle_status"], string> = {
        passed: "The test oracle reported that the condition was satisfied.",
        failed: "The test oracle reported that the condition was not satisfied.",
        pending:
            "The test oracle had not reached a definite result when this evaluation was recorded.",
        unknown: "The test oracle could not determine the outcome.",
        error: "The test oracle encountered a problem while evaluating the condition.",
    };
    return (
        <article className="evaluation">
            <div className="evaluation-heading">
                <strong>{data.name}</strong>
                <span className={"badge " + data.oracle_status}>{data.oracle_status}</span>
            </div>
            <p className="muted">
                {descriptions[data.oracle_status]}
                {data.oracle_status === "pending" && runFinished ? " The run has ended." : ""}
            </p>
            {assessment && (
                <div className="assessment-context">
                    <span className="badge recorded">{assessment.phase.replaceAll("_", " ")}</span>
                    {assessment.semantics && (
                        <p className="muted">
                            {assessment.semantics === "open_ended"
                                ? "This condition can depend on future observations."
                                : "This condition concerns the reported observation interval."}
                        </p>
                    )}
                    {assessment.phase.startsWith("end_") &&
                        (assessment.terminationReason ?? runReason) && (
                            <p className="muted">
                                Run ending: {assessment.terminationReason ?? runReason}
                            </p>
                        )}
                </div>
            )}
            <p className="muted">Target: {data.oracle_target.target_type.replaceAll("_", " ")}</p>
            <Properties
                values={{
                    Oracle: data.oracle,
                    "Oracle target": data.oracle_target,
                    "Expected value": Object.hasOwn(data, "expected_value")
                        ? data.expected_value
                        : "Not supplied",
                    "Observed value": Object.hasOwn(data, "observed_value")
                        ? data.observed_value
                        : "Not supplied",
                    "Oracle details": data.oracle_details,
                    ...(data.oracle_severity === undefined
                        ? {}
                        : { "Oracle severity": data.oracle_severity }),
                }}
            />
        </article>
    );
}
