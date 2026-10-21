import { useEffect, useMemo, useState } from "react";
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
    const [limit, setLimit] = useState(50);
    useEffect(() => setLimit(50), [checks, status]);
    const counts = useMemo(() => {
        const values = new Map<Check["status"], number>();
        for (const check of checks) {
            values.set(check.data.status, (values.get(check.data.status) ?? 0) + 1);
        }
        return values;
    }, [checks]);
    const filtered = checks.filter((check) => status === "all" || check.data.status === status);
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
            <p className="muted" role="status">
                {filtered.length} of {checks.length} evaluations shown.
            </p>
            {filtered.slice(0, limit).map((check) => (
                <Evaluation
                    key={check.id}
                    data={check.data}
                    runFinished={model.runs.get(check.data.run)?.status === "finished"}
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
