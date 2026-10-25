import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import {
    DEFAULT_PRESETS,
    parseDefinition,
    runKey,
    type EvidenceReference,
    type ExecutionReference,
    type DerivedModel,
    type MatchingPreview as Preview,
    type MatchingProgress,
} from "./analysis";
import { matchingInputs } from "./matching-input";
import { MatchingResults } from "./MatchingResults";
import { formatJson } from "./evidence/common";
import type { ImportedSource } from "./evidence/import";

const DerivedModelView = lazy(() =>
    import("./DerivedModelView").then((module) => ({ default: module.DerivedModelView })),
);

interface Props {
    sources: ImportedSource[];
    active: boolean;
    onOpenObservation: (reference: EvidenceReference) => void;
    onOpenExecution: (reference: ExecutionReference) => void;
}

function downloadJson(name: string, value: unknown) {
    const url = URL.createObjectURL(
        new Blob([formatJson(value) + "\n"], {
            type: "application/json",
        }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function MatchingPreview({ sources, active, onOpenObservation, onOpenExecution }: Props) {
    const [preset, setPreset] = useState("0");
    const [definition, setDefinition] = useState(() => formatJson(DEFAULT_PRESETS[0].definition));
    const [excludedRuns, setExcludedRuns] = useState<Set<string>>(new Set());
    const [runLimit, setRunLimit] = useState(50);
    const [preview, setPreview] = useState<Preview | null>(null);
    const [model, setModel] = useState<DerivedModel | null>(null);
    const [resultView, setResultView] = useState<"groups" | "derived">("groups");
    const [derivedOpened, setDerivedOpened] = useState(false);
    const [groupFocus, setGroupFocus] = useState<{ id: string } | undefined>();
    const [error, setError] = useState("");
    const [busy, setBusy] = useState(false);
    const [progress, setProgress] = useState<MatchingProgress | null>(null);
    const worker = useRef<Worker | null>(null);
    const runs = useMemo(
        () =>
            sources.flatMap((source) =>
                Array.from(source.evidence.runs.values(), (run) => ({
                    key: runKey(source.id, run.id),
                    label: source.label + " / " + run.producer + " / " + run.source_run,
                })),
            ),
        [sources],
    );
    const selectedRuns = runs.filter((run) => !excludedRuns.has(run.key)).map((run) => run.key);

    useEffect(() => {
        setPreview(null);
        setModel(null);
        setResultView("groups");
        setDerivedOpened(false);
        setGroupFocus(undefined);
        setError("");
        setBusy(false);
        setProgress(null);
        return () => {
            worker.current?.terminate();
            worker.current = null;
        };
    }, [sources]);

    function cancel() {
        worker.current?.terminate();
        worker.current = null;
        setBusy(false);
        setProgress(null);
    }

    function invalidate() {
        cancel();
        setPreview(null);
        setModel(null);
        setResultView("groups");
        setDerivedOpened(false);
        setGroupFocus(undefined);
        setError("");
    }

    function start() {
        invalidate();
        try {
            parseDefinition(definition);
            const inputs = matchingInputs(sources, selectedRuns);
            const instance = new Worker(new URL("./matching.worker.ts", import.meta.url), {
                type: "module",
            });
            worker.current = instance;
            instance.onmessage = (message) => {
                if (worker.current !== instance) {
                    return;
                }
                const result = message.data;
                if (result.kind === "progress") {
                    setProgress(result.progress);
                } else if (result.kind === "complete") {
                    setPreview(result.preview);
                    setModel(result.model);
                    cancel();
                } else if (result.kind === "error") {
                    setError(result.message);
                    cancel();
                }
            };
            instance.onerror = () => {
                if (worker.current === instance) {
                    setError("The matching worker stopped. Try selecting fewer runs.");
                    cancel();
                }
            };
            setBusy(true);
            instance.postMessage({ sources: inputs, definition, selectedRuns });
        } catch (failure) {
            cancel();
            setError(failure instanceof Error ? failure.message : "Matching could not be started.");
        }
    }

    function downloadRules() {
        try {
            downloadJson("matching-rules.json", parseDefinition(definition));
        } catch (failure) {
            setError(failure instanceof Error ? failure.message : "Check the matching definition.");
        }
    }

    return (
        <div className="matching-workspace">
            <div className="matching-heading">
                <span className="eyebrow">COMPARE RECORDED EVIDENCE</span>
                <h1>Match evidence across runs</h1>
                <p>
                    Select the evidence and the properties that matter for your testing objective.
                    Preview which observations agree, then inspect their original records.
                </p>
            </div>
            <div className="matching-controls">
                <section className="matching-panel">
                    <h2>Runs to compare</h2>
                    <p className="muted">
                        {selectedRuns.length} of {runs.length} runs selected.
                    </p>
                    <div className="matching-runs">
                        {runs.slice(0, runLimit).map((run) => (
                            <label className="matching-run compact-toggle" key={run.key}>
                                <input
                                    type="checkbox"
                                    checked={!excludedRuns.has(run.key)}
                                    onChange={(event) => {
                                        invalidate();
                                        const next = new Set(excludedRuns);
                                        if (event.target.checked) {
                                            next.delete(run.key);
                                        } else {
                                            next.add(run.key);
                                        }
                                        setExcludedRuns(next);
                                    }}
                                />
                                <span>{run.label}</span>
                            </label>
                        ))}
                    </div>
                    {runs.length > runLimit && (
                        <button className="quiet" onClick={() => setRunLimit(runLimit + 50)}>
                            Show more runs
                        </button>
                    )}
                </section>
                <section className="matching-panel">
                    <h2>Comparison rules</h2>
                    <label className="search-label">
                        Matching preset
                        <select
                            aria-label="Matching preset"
                            value={preset}
                            onChange={(event) => {
                                invalidate();
                                setPreset(event.target.value);
                                setDefinition(
                                    formatJson(
                                        DEFAULT_PRESETS[Number(event.target.value)].definition,
                                    ),
                                );
                            }}
                        >
                            {DEFAULT_PRESETS.map((item, index) => (
                                <option value={index} key={item.name}>
                                    {item.name}
                                </option>
                            ))}
                            {preset === "custom" && <option value="custom">Custom rules</option>}
                        </select>
                    </label>
                    <p className="muted">
                        {preset === "custom"
                            ? "The JSON definition controls which captured values are compared."
                            : DEFAULT_PRESETS[Number(preset)].description}
                    </p>
                    <details>
                        <summary>Edit matching rules (JSON)</summary>
                        <textarea
                            aria-label="Matching definition"
                            spellCheck={false}
                            value={definition}
                            onChange={(event) => {
                                invalidate();
                                setPreset("custom");
                                setDefinition(event.target.value);
                            }}
                        />
                    </details>
                    <div className="matching-actions">
                        <button
                            className="primary"
                            disabled={selectedRuns.length === 0 || busy}
                            onClick={start}
                        >
                            Preview matches
                        </button>
                        <button className="quiet" onClick={downloadRules}>
                            Download rules
                        </button>
                    </div>
                </section>
            </div>
            {error && (
                <p className="notice matching-error" role="alert">
                    {error}
                </p>
            )}
            {busy && (
                <div className="matching-progress" role="status">
                    <span>
                        {progress?.stage ?? "Preparing comparison"}
                        {progress ? " " + progress.completed + " / " + progress.total : ""}
                    </span>
                    <button className="quiet" onClick={cancel}>
                        Cancel matching
                    </button>
                </div>
            )}
            {preview ? (
                <>
                    <div className="matching-actions">
                        <span className="muted">
                            {preview.counts.observations} observations compared under{" "}
                            {preview.definition.name}.
                        </span>
                        <button
                            className="quiet"
                            onClick={() => downloadJson("matching-preview.json", preview)}
                        >
                            Download preview
                        </button>
                    </div>
                    <nav className="result-views" aria-label="Analysis view">
                        <button
                            aria-pressed={resultView === "groups"}
                            onClick={() => setResultView("groups")}
                        >
                            Matching groups
                        </button>
                        <button
                            aria-pressed={resultView === "derived"}
                            onClick={() => {
                                setDerivedOpened(true);
                                setResultView("derived");
                            }}
                        >
                            Derived model
                        </button>
                        {model && (
                            <button
                                className="quiet"
                                onClick={() =>
                                    downloadJson("derived-model.json", {
                                        definition: preview.definition,
                                        policyFingerprint: preview.policyFingerprint,
                                        interpreterVersion: preview.interpreterVersion,
                                        inputScope: preview.inputScope,
                                        model,
                                    })
                                }
                            >
                                Download model
                            </button>
                        )}
                    </nav>
                    <div hidden={resultView !== "groups"}>
                        <MatchingResults
                            key={preview.policyFingerprint + JSON.stringify(preview.inputScope)}
                            preview={preview}
                            sources={sources}
                            groupFocus={groupFocus}
                            onOpenObservation={onOpenObservation}
                        />
                    </div>
                    {derivedOpened && model && (
                        <div hidden={resultView !== "derived"}>
                            <Suspense
                                fallback={<p className="notice">Preparing derived model...</p>}
                            >
                                <DerivedModelView
                                    model={model}
                                    preview={preview}
                                    sources={sources}
                                    active={active && resultView === "derived"}
                                    onOpenObservation={onOpenObservation}
                                    onOpenExecution={onOpenExecution}
                                    onInspectGroup={(id) => {
                                        setGroupFocus({ id });
                                        setResultView("groups");
                                    }}
                                />
                            </Suspense>
                        </div>
                    )}
                </>
            ) : (
                !busy && <p className="notice">Preview these rules to see proposed groups.</p>
            )}
        </div>
    );
}
