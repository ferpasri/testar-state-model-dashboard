import { assessmentContext } from "./evidence/assessment";
import { formatJson } from "./evidence/common";
import type { Check } from "./evidence/schema";

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
    data: Check;
    runFinished: boolean;
    runReason?: string;
}) {
    const assessment = assessmentContext(data);
    const descriptions: Record<Check["status"], string> = {
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
                <span className={"badge " + data.status}>{data.status}</span>
            </div>
            <p className="muted">
                {descriptions[data.status]}
                {data.status === "pending" && runFinished ? " The run has ended." : ""}
            </p>
            {assessment && (
                <div className="assessment-context">
                    <span className="badge recorded">
                        {assessment.phase === "end_of_run"
                            ? "End-of-run assessment"
                            : "During-run assessment"}
                    </span>
                    {assessment.semantics && (
                        <p className="muted">
                            {assessment.semantics === "open_ended"
                                ? "This condition can depend on future observations."
                                : "This condition concerns the reported observation interval."}
                        </p>
                    )}
                    {assessment.phase === "end_of_run" &&
                        (assessment.terminationReason ?? runReason) && (
                            <p className="muted">
                                Run ending: {assessment.terminationReason ?? runReason}
                            </p>
                        )}
                </div>
            )}
            <p className="muted">Target: {data.target.kind.replaceAll("_", " ")}</p>
            <Properties
                values={{
                    rule: data.rule,
                    target: data.target,
                    expected: Object.hasOwn(data, "expected") ? data.expected : "Not supplied",
                    actual: Object.hasOwn(data, "actual") ? data.actual : "Not supplied",
                    details: data.details,
                }}
            />
        </article>
    );
}
