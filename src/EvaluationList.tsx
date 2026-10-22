import { useEffect, useMemo, useState } from "react";
import { assessmentContext } from "./evidence/assessment";
import { Evaluation } from "./EvidenceFields";
import type { EvidenceModel } from "./evidence/model";
import type { Check } from "./evidence/schema";

const statuses = ["passed", "failed", "pending", "unknown", "error"] as const;

export function EvaluationList({
    checks,
    model,
}: {
    checks: EvidenceModel["checks"];
    model: EvidenceModel;
}) {
    const [status, setStatus] = useState<Check["status"] | "all">("all");
    const [phase, setPhase] = useState("all");
    const [limit, setLimit] = useState(50);
    useEffect(() => setLimit(50), [checks, status, phase]);
    const counts = useMemo(() => {
        const values = new Map<Check["status"], number>();
        for (const check of checks) {
            values.set(check.data.status, (values.get(check.data.status) ?? 0) + 1);
        }
        return values;
    }, [checks]);
    const phases = useMemo(() => {
        const values = new Map<string, number>();
        for (const check of checks) {
            const value = assessmentContext(check.data)?.phase ?? "unspecified";
            values.set(value, (values.get(value) ?? 0) + 1);
        }
        return values;
    }, [checks]);
    const filtered = checks.filter(
        (check) =>
            (status === "all" || check.data.status === status) &&
            (phase === "all" || (assessmentContext(check.data)?.phase ?? "unspecified") === phase),
    );
    return (
        <>
            <div className="evaluation-filters" role="group" aria-label="Evaluation status">
                {(["all", ...statuses] as const).map((value) => (
                    <button
                        key={value}
                        className={"badge " + value}
                        aria-pressed={status === value}
                        onClick={() => setStatus(value)}
                    >
                        {value[0].toUpperCase() + value.slice(1)} (
                        {value === "all" ? checks.length : (counts.get(value) ?? 0)})
                    </button>
                ))}
            </div>
            {(phases.has("during_run") || phases.has("end_of_run") || phase !== "all") && (
                <div className="evaluation-filters" role="group" aria-label="Assessment phase">
                    {[
                        ["all", "All phases"],
                        ["during_run", "During run"],
                        ["end_of_run", "End of run"],
                        ["unspecified", "Phase not reported"],
                    ].map(([value, label]) => (
                        <button
                            key={value}
                            className="badge unrecorded"
                            aria-pressed={phase === value}
                            onClick={() => setPhase(value)}
                        >
                            {label} ({value === "all" ? checks.length : (phases.get(value) ?? 0)})
                        </button>
                    ))}
                </div>
            )}
            <p className="muted" role="status">
                {filtered.length} of {checks.length} evaluations shown.
            </p>
            {filtered.slice(0, limit).map((check) => (
                <Evaluation
                    key={check.id}
                    data={check.data}
                    runFinished={model.runs.get(check.data.run)?.status === "finished"}
                    runReason={model.runs.get(check.data.run)?.reason ?? undefined}
                />
            ))}
            {filtered.length === 0 && (
                <p className="muted">No recorded evaluations match this filter.</p>
            )}
            {filtered.length > limit && (
                <button className="quiet" onClick={() => setLimit((value) => value + 50)}>
                    Show more evaluations
                </button>
            )}
        </>
    );
}
