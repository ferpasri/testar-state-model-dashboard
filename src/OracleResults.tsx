import { useEffect, useMemo, useState } from "react";
import { assessmentContext } from "./evidence/assessment";
import { OracleResultView } from "./EvidenceFields";
import type { ReconstructedEvidence } from "./evidence/reconstructed-evidence";
import type { OracleResult } from "./evidence/schema";

const statuses = ["passed", "failed", "pending", "unknown", "error"] as const;

export function OracleResults({
    oracleResults,
    evidence,
}: {
    oracleResults: ReconstructedEvidence["oracleResults"];
    evidence: ReconstructedEvidence;
}) {
    const [status, setStatus] = useState<OracleResult["oracle_status"] | "all">("all");
    const [phase, setPhase] = useState("all");
    const [limit, setLimit] = useState(50);
    useEffect(() => setLimit(50), [oracleResults, status, phase]);
    const counts = useMemo(() => {
        const values = new Map<OracleResult["oracle_status"], number>();
        for (const check of oracleResults) {
            values.set(check.data.oracle_status, (values.get(check.data.oracle_status) ?? 0) + 1);
        }
        return values;
    }, [oracleResults]);
    const phases = useMemo(() => {
        const values = new Map<string, number>();
        for (const check of oracleResults) {
            const value = assessmentContext(check.data)?.phase ?? "unspecified";
            values.set(value, (values.get(value) ?? 0) + 1);
        }
        return values;
    }, [oracleResults]);
    const filtered = oracleResults.filter(
        (check) =>
            (status === "all" || check.data.oracle_status === status) &&
            (phase === "all" || (assessmentContext(check.data)?.phase ?? "unspecified") === phase),
    );
    return (
        <>
            <div className="evaluation-filters" role="group" aria-label="Oracle status">
                {(["all", ...statuses] as const).map((value) => (
                    <button
                        key={value}
                        className={"badge " + value}
                        aria-pressed={status === value}
                        onClick={() => setStatus(value)}
                    >
                        {value[0].toUpperCase() + value.slice(1)} (
                        {value === "all" ? oracleResults.length : (counts.get(value) ?? 0)})
                    </button>
                ))}
            </div>
            {([...phases.keys()].some((value) => value !== "unspecified") || phase !== "all") && (
                <div className="evaluation-filters" role="group" aria-label="Assessment phase">
                    {[
                        ["all", "All phases"],
                        ["during_run", "During run"],
                        ["end_of_run", "End of run"],
                        ["during_sequence", "During sequence"],
                        ["end_of_sequence", "End of sequence"],
                        ["unspecified", "Phase not reported"],
                    ].map(([value, label]) => (
                        <button
                            key={value}
                            className="badge unrecorded"
                            aria-pressed={phase === value}
                            onClick={() => setPhase(value)}
                        >
                            {label} (
                            {value === "all" ? oracleResults.length : (phases.get(value) ?? 0)})
                        </button>
                    ))}
                </div>
            )}
            <p className="muted" role="status">
                {filtered.length} of {oracleResults.length} oracle results shown.
            </p>
            {filtered.slice(0, limit).map((check) => (
                <OracleResultView
                    key={check.id}
                    data={check.data}
                    runFinished={evidence.runs.get(check.data.test_run)?.status === "finished"}
                    runReason={evidence.runs.get(check.data.test_run)?.reason ?? undefined}
                />
            ))}
            {filtered.length === 0 && <p className="muted">No oracle results match this filter.</p>}
            {filtered.length > limit && (
                <button className="quiet" onClick={() => setLimit((value) => value + 50)}>
                    Show more oracle results
                </button>
            )}
        </>
    );
}
