import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import {
    DEFAULT_PRESETS,
    parseAbstractionRules,
    runKey,
    type EvidenceReference,
    type ExecutionReference,
    type AbstractModel,
    type AbstractionPreview as Preview,
    type AbstractionProgress,
} from "./analysis";
import { abstractionInputs } from "./abstraction-input";
import { ObservationGroups } from "./ObservationGroups";
import { formatJson } from "./evidence/common";
import type { ImportedSource } from "./evidence/import";

const AbstractModelView = lazy(() =>
    import("./AbstractModelView").then((module) => ({ default: module.AbstractModelView })),
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

export function AbstractionPreview({ sources, active, onOpenObservation, onOpenExecution }: Props) {
    const [preset, setPreset] = useState("0");
    const [setupOpen, setSetupOpen] = useState(true);
    const [definition, setDefinition] = useState(() => formatJson(DEFAULT_PRESETS[0].definition));
    const [excludedRuns, setExcludedRuns] = useState<Set<string>>(new Set());
    const [runLimit, setRunLimit] = useState(50);
    const [preview, setPreview] = useState<Preview | null>(null);
    const [model, setModel] = useState<AbstractModel | null>(null);
    const [resultView, setResultView] = useState<"groups" | "model">("groups");
    const [abstractModelOpened, setAbstractModelOpened] = useState(false);
    const [groupFocus, setGroupFocus] = useState<{ id: string } | undefined>();
    const [error, setError] = useState("");
    const [busy, setBusy] = useState(false);
    const [progress, setProgress] = useState<AbstractionProgress | null>(null);
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
        setSetupOpen(true);
        setPreview(null);
        setModel(null);
        setResultView("groups");
        setAbstractModelOpened(false);
        setGroupFocus(undefined);
        setError("");
        setBusy(false);
        setProgress(null);
        return () => {
            worker.current?.terminate();
            worker.current = null;
        };
    }, [sources]);

    useEffect(() => {
        if (preview && active) {
            window.scrollTo({ top: 0, behavior: "instant" });
        }
    }, [preview]);

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
        setAbstractModelOpened(false);
        setGroupFocus(undefined);
        setError("");
    }

    function start() {
        invalidate();
        try {
            parseAbstractionRules(definition);
            const inputs = abstractionInputs(sources, selectedRuns);
            const instance = new Worker(new URL("./abstraction.worker.ts", import.meta.url), {
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
                    setAbstractModelOpened(true);
                    setResultView("model");
                    setSetupOpen(false);
                    cancel();
                } else if (result.kind === "error") {
                    setError(result.message);
                    cancel();
                }
            };
            instance.onerror = () => {
                if (worker.current === instance) {
                    setError("The abstraction worker stopped. Try selecting fewer runs.");
                    cancel();
                }
            };
            setBusy(true);
            instance.postMessage({ sources: inputs, definition, selectedRuns });
        } catch (failure) {
            cancel();
            setError(
                failure instanceof Error
                    ? failure.message
                    : "Model construction could not be started.",
            );
        }
    }

    function downloadRules() {
        try {
            downloadJson("abstraction-rules.json", parseAbstractionRules(definition));
        } catch (failure) {
            setError(
                failure instanceof Error ? failure.message : "Check the abstraction rules (JSON).",
            );
        }
    }

    return (
        <div className="abstraction-workspace">
            <div className="abstraction-heading" hidden={preview !== null}>
                <span className="eyebrow">COMPARE RECORDED EVIDENCE</span>
                <h1>Construct an abstract model</h1>
            </div>
            <details
                className="model-setup"
                open={setupOpen}
                onToggle={(event) => setSetupOpen(event.currentTarget.open)}
            >
                <summary>
                    Model setup{" "}
                    <span>
                        {selectedRuns.length} runs ·{" "}
                        {preset === "custom"
                            ? "Custom rules"
                            : DEFAULT_PRESETS[Number(preset)].name}
                    </span>
                </summary>
                <p>
                    Select the evidence and the properties that matter for your testing objective.
                    Preview which observations agree, then inspect their original records.
                </p>
                <div className="abstraction-controls">
                    <section className="abstraction-panel">
                        <h2>Runs to compare</h2>
                        <p className="muted">
                            {selectedRuns.length} of {runs.length} runs selected.
                        </p>
                        <div className="abstraction-runs">
                            {runs.slice(0, runLimit).map((run) => (
                                <label className="abstraction-run compact-toggle" key={run.key}>
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
                    <section className="abstraction-panel">
                        <h2>Abstraction rules</h2>
                        <label className="search-label">
                            Abstraction preset
                            <select
                                aria-label="Abstraction preset"
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
                                {preset === "custom" && (
                                    <option value="custom">Custom rules</option>
                                )}
                            </select>
                        </label>
                        <p className="muted">
                            {preset === "custom"
                                ? "The JSON definition controls which captured values are compared."
                                : DEFAULT_PRESETS[Number(preset)].description}
                        </p>
                        <details>
                            <summary>Edit abstraction rules (JSON)</summary>
                            <textarea
                                aria-label="Abstraction rules (JSON)"
                                spellCheck={false}
                                value={definition}
                                onChange={(event) => {
                                    invalidate();
                                    setPreset("custom");
                                    setDefinition(event.target.value);
                                }}
                            />
                        </details>
                        <div className="abstraction-actions">
                            <button
                                className="primary"
                                disabled={selectedRuns.length === 0 || busy}
                                onClick={start}
                            >
                                Build model
                            </button>
                            <button className="quiet" onClick={downloadRules}>
                                Download rules
                            </button>
                        </div>
                    </section>
                </div>
            </details>
            {error && (
                <p className="notice abstraction-error" role="alert">
                    {error}
                </p>
            )}
            {busy && (
                <div className="abstraction-progress" role="status">
                    <span>
                        {progress?.stage ?? "Preparing comparison"}
                        {progress ? " " + progress.completed + " / " + progress.total : ""}
                    </span>
                    <button className="quiet" onClick={cancel}>
                        Cancel model construction
                    </button>
                </div>
            )}
            {preview ? (
                <>
                    <nav className="result-views" aria-label="Analysis view">
                        <button
                            aria-pressed={resultView === "groups"}
                            onClick={() => setResultView("groups")}
                        >
                            Observation groups
                        </button>
                        <button
                            aria-pressed={resultView === "model"}
                            onClick={() => {
                                setAbstractModelOpened(true);
                                setResultView("model");
                            }}
                        >
                            Abstract model
                        </button>
                        <button
                            className="quiet"
                            onClick={() => downloadJson("abstraction-preview.json", preview)}
                        >
                            Download preview
                        </button>
                        {model && (
                            <button
                                className="quiet"
                                onClick={() =>
                                    downloadJson("abstract-model.json", {
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
                        <ObservationGroups
                            key={preview.policyFingerprint + JSON.stringify(preview.inputScope)}
                            preview={preview}
                            sources={sources}
                            groupFocus={groupFocus}
                            onOpenObservation={onOpenObservation}
                        />
                    </div>
                    {abstractModelOpened && model && (
                        <div hidden={resultView !== "model"}>
                            <Suspense
                                fallback={<p className="notice">Preparing abstract model...</p>}
                            >
                                <AbstractModelView
                                    model={model}
                                    preview={preview}
                                    sources={sources}
                                    active={active && resultView === "model"}
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
