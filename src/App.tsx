import {
    lazy,
    Suspense,
    useCallback,
    useMemo,
    useRef,
    useState,
    type InputHTMLAttributes,
} from "react";
import { Details } from "./Details";
import { ExecutionDetails } from "./ExecutionDetails";
import { ObservationGapDetails } from "./ObservationGapDetails";
import { observationGaps } from "./evidence/trace";
import type { EvidenceReference, ExecutionReference } from "./analysis";
const MatchingPreview = lazy(() =>
    import("./MatchingPreview").then((module) => ({ default: module.MatchingPreview })),
);
const Graph = lazy(() => import("./Graph").then((module) => ({ default: module.Graph })));
import type { ImportedSource, Progress } from "./evidence/import";
import { displayValue } from "./evidence/common";
import { version } from "../package.json";

export function App() {
    const [sources, setSources] = useState<ImportedSource[]>([]);
    const [view, setView] = useState<"traces" | "matching">("traces");
    const [matchingOpened, setMatchingOpened] = useState(false);
    const [sourceId, setSourceId] = useState("");
    const [runId, setRunId] = useState("");
    const [observationId, setObservationId] = useState("");
    const [executionId, setExecutionId] = useState("");
    const [gapId, setGapId] = useState("");
    const [error, setError] = useState("");
    const [busy, setBusy] = useState(false);
    const [progress, setProgress] = useState<Progress | null>(null);
    const sourcesRef = useRef(sources);
    sourcesRef.current = sources;
    const fileInput = useRef<HTMLInputElement>(null);
    const worker = useRef<Worker | null>(null);
    const source = sources.find((item) => item.id === sourceId);
    const observations = useMemo(
        () =>
            source
                ? Array.from(source.model.observations.values())
                      .filter((item) => item.run === runId)
                      .sort((left, right) => left.sequence - right.sequence)
                : [],
        [source, runId],
    );
    const observation = observations.find((item) => item.id === observationId) ?? observations[0];
    const selectObservation = useCallback((id: string) => {
        setObservationId(id);
        setExecutionId("");
        setGapId("");
    }, []);
    const selectExecution = useCallback((id: string) => {
        setExecutionId(id);
        setGapId("");
    }, []);
    const selectGap = useCallback((id: string) => {
        setGapId(id);
        setExecutionId("");
    }, []);
    const gaps = useMemo(
        () => (source ? observationGaps(source.model, observations) : []),
        [source, observations],
    );
    const selectedGap = gaps.find((gap) => gap.id === gapId);
    const selectedIndex = Math.max(
        0,
        observations.findIndex((item) => item.id === observation?.id),
    );
    const graphStart = Math.max(0, selectedIndex - 500);
    const graphObservations = useMemo(
        () => observations.slice(graphStart, graphStart + 1000),
        [observations, graphStart],
    );
    const totals = useMemo(
        () =>
            sources.reduce(
                (counts, item) => ({
                    observations: counts.observations + item.model.observations.size,
                    executions: counts.executions + item.model.executions.size,
                    checks: counts.checks + item.model.checks.length,
                }),
                { observations: 0, executions: 0, checks: 0 },
            ),
        [sources],
    );

    function selectRun(item: ImportedSource, id: string) {
        setView("traces");
        setSourceId(item.id);
        setRunId(id);
        setObservationId("");
        setExecutionId("");
        setGapId("");
    }
    function openOriginalObservation(reference: EvidenceReference) {
        const originalSource = sources.find((item) => item.id === reference.source);
        const original = originalSource?.model.observations.get(reference.observation);
        if (!originalSource || original?.run !== reference.run) {
            return;
        }
        selectRun(originalSource, reference.run);
        setObservationId(reference.observation);
    }
    function openOriginalExecution(reference: ExecutionReference) {
        const originalSource = sources.find((item) => item.id === reference.source);
        const original = originalSource?.model.executions.get(reference.execution);
        if (!originalSource || original?.execution.run !== reference.run) {
            return;
        }
        selectRun(originalSource, reference.run);
        setObservationId(original.execution.source);
        setExecutionId(reference.execution);
    }
    function cancel() {
        worker.current?.terminate();
        worker.current = null;
        setBusy(false);
        setProgress(null);
    }
    function load(files: FileList | null) {
        if (!files || files.length === 0) {
            return;
        }
        cancel();
        setError("");
        setBusy(true);
        const instance = new Worker(new URL("./import.worker.ts", import.meta.url), {
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
            } else if (result.kind === "error") {
                setError(result.message);
                cancel();
            } else if (result.kind === "complete") {
                const loaded = result.sources as ImportedSource[];
                const combined = Array.from(
                    new Map(
                        [...sourcesRef.current, ...loaded].map((item) => [item.id, item]),
                    ).values(),
                );
                if (
                    combined.length > 20 ||
                    combined.reduce((sum, item) => sum + item.bytes, 0) > 512 * 1024 ** 2
                ) {
                    setError(
                        "Workspace limit: 20 sources or 512 MiB. Remove sources before importing more.",
                    );
                    cancel();
                    return;
                }
                setSources(combined);
                const first = loaded[0];
                if (first) {
                    selectRun(first, first.model.runs.keys().next().value ?? "");
                }
                cancel();
            }
        };
        instance.onerror = () => {
            setError(
                "The import worker stopped unexpectedly. Try a smaller model or check the browser console.",
            );
            cancel();
        };
        instance.postMessage(
            Array.from(files, (file) => ({ path: file.webkitRelativePath || file.name, file })),
        );
        if (fileInput.current) {
            fileInput.current.value = "";
        }
    }
    function remove(id: string) {
        setSources((previous) => previous.filter((item) => item.id !== id));
        if (id === sourceId) {
            setSourceId("");
            setRunId("");
            setObservationId("");
            setExecutionId("");
            setGapId("");
        }
    }
    const directoryAttributes = {
        webkitdirectory: "",
        directory: "",
    } as InputHTMLAttributes<HTMLInputElement>;
    return (
        <div className="application">
            <header className="topbar">
                <div className="brand">
                    <span className="brand-mark">t.</span>
                    <div>
                        <strong>TESTAR</strong>
                        <span>STATE MODEL / EVIDENCE EXPLORER</span>
                    </div>
                </div>
                <div className="topbar-actions">
                    <span className="local-badge">
                        <span /> Files stay in this browser
                    </span>
                    <button
                        className="primary"
                        disabled={busy}
                        onClick={() => fileInput.current?.click()}
                    >
                        Open model folder <span aria-hidden="true">↗</span>
                    </button>
                </div>
                <input
                    ref={fileInput}
                    type="file"
                    {...directoryAttributes}
                    multiple
                    hidden
                    aria-label="Model directory"
                    onChange={(event) => load(event.target.files)}
                />
            </header>
            {error && (
                <div className="import-error" role="alert">
                    <strong>Import could not be completed.</strong> {error}
                    <button onClick={() => setError("")} aria-label="Dismiss error">
                        ×
                    </button>
                </div>
            )}
            {busy && (
                <div className="import-progress" role="status">
                    <span>
                        {progress?.stage ?? "Opening evidence…"}{" "}
                        {progress
                            ? progress.completed +
                              (progress.total ? " / " + progress.total : " records")
                            : ""}
                    </span>
                    <button className="quiet" onClick={cancel}>
                        Cancel import
                    </button>
                </div>
            )}
            {sources.length === 0 ? (
                <main className="welcome">
                    <span className="eyebrow">FROM EXECUTION TO UNDERSTANDING</span>
                    <h1>
                        Follow the
                        <br />
                        <em>evidence.</em>
                    </h1>
                    <p>
                        Explore what happened, one observation at a time.
                        <br />
                        Bring traces from your testing tools into a shared view.
                    </p>
                    <button
                        className="primary large"
                        disabled={busy}
                        onClick={() => fileInput.current?.click()}
                    >
                        Open your first model folder <span aria-hidden="true">↗</span>
                    </button>
                    <div className="welcome-foot">
                        <div>
                            <span>01 / LOAD</span>
                            <p>Select a folder with a manifest, JSONL evidence, and artifacts.</p>
                        </div>
                        <div>
                            <span>02 / EXPLORE</span>
                            <p>Follow actions between visits and inspect the captured evidence.</p>
                        </div>
                        <div>
                            <span>03 / COMPARE</span>
                            <p>Open more sources while preserving each original trace.</p>
                        </div>
                    </div>
                </main>
            ) : (
                <main className="workspace">
                    <aside className="sidebar">
                        <div className="sidebar-title">
                            <span className="eyebrow">YOUR WORKSPACE</span>
                            <span className="badge">
                                {sources.length} {sources.length === 1 ? "source" : "sources"}
                            </span>
                        </div>
                        <h2>Execution evidence</h2>
                        <div className="workspace-stats">
                            <div>
                                <strong>{totals.observations}</strong>
                                <span>visits</span>
                            </div>
                            <div>
                                <strong>{totals.executions}</strong>
                                <span>actions</span>
                            </div>
                            <div>
                                <strong>{totals.checks}</strong>
                                <span>evaluations</span>
                            </div>
                        </div>
                        <nav className="workspace-views" aria-label="Workspace view">
                            <button
                                aria-pressed={view === "traces"}
                                onClick={() => setView("traces")}
                            >
                                Trace inspection
                            </button>
                            <button
                                aria-pressed={view === "matching"}
                                onClick={() => {
                                    setMatchingOpened(true);
                                    setView("matching");
                                }}
                            >
                                Matching preview
                            </button>
                        </nav>
                        <div className="source-list">
                            {sources.map((item) => (
                                <section className="source" key={item.id}>
                                    <div className="source-heading">
                                        <strong title={item.model.manifest.model}>
                                            {item.label}
                                        </strong>
                                        <button
                                            className="remove"
                                            onClick={() => remove(item.id)}
                                            aria-label={"Remove " + item.label}
                                        >
                                            ×
                                        </button>
                                    </div>
                                    <span className="source-fingerprint">
                                        SOURCE {item.fingerprint.slice(0, 10)}
                                    </span>
                                    {Array.from(item.model.runs.values()).map((run) => (
                                        <button
                                            key={run.id}
                                            className={
                                                "run " +
                                                (sourceId === item.id && runId === run.id
                                                    ? "active"
                                                    : "")
                                            }
                                            onClick={() => selectRun(item, run.id)}
                                        >
                                            <span>{run.producer}</span>
                                            <small>
                                                {run.status === "finished"
                                                    ? run.reason
                                                    : "Run open"}{" "}
                                                · {run.source_run}
                                            </small>
                                        </button>
                                    ))}
                                    {item.model.runs.size === 0 && (
                                        <p className="muted">
                                            This model contains no recorded runs.
                                        </p>
                                    )}
                                </section>
                            ))}
                        </div>
                        <p className="sidebar-note">
                            Imported sources remain separate. Select a run to follow its concrete
                            execution history.
                        </p>
                    </aside>
                    {matchingOpened && (
                        <div className="comparison-workspace" hidden={view !== "matching"}>
                            <Suspense
                                fallback={<p className="notice">Preparing matching preview...</p>}
                            >
                                <MatchingPreview
                                    sources={sources}
                                    active={view === "matching"}
                                    onOpenObservation={openOriginalObservation}
                                    onOpenExecution={openOriginalExecution}
                                />
                            </Suspense>
                        </div>
                    )}
                    {view === "matching" ? null : source && observation ? (
                        <div className="run-workspace">
                            <div className="run-banner">
                                <div>
                                    <span className="eyebrow">SELECTED RUN</span>
                                    <h2>{source.model.runs.get(runId)?.producer}</h2>
                                    <p>
                                        {source.model.runs.get(runId)?.reason ??
                                            "Run is still open"}
                                    </p>
                                </div>
                                <div className="run-count">
                                    {observations.length}
                                    <span>observations</span>
                                </div>
                            </div>
                            <div className="evidence-layout">
                                <div className="trace-column">
                                    <Suspense
                                        fallback={<p className="notice">Preparing trace graph…</p>}
                                    >
                                        <Graph
                                            model={source.model}
                                            observations={graphObservations}
                                            selected={observation.id}
                                            onSelect={selectObservation}
                                            selectedExecution={executionId}
                                            onSelectExecution={selectExecution}
                                            gaps={gaps}
                                            selectedGap={gapId}
                                            onSelectGap={selectGap}
                                        />
                                    </Suspense>
                                    {observations.length > 1000 && (
                                        <p className="notice">
                                            Graph shows a window of up to 1,000 observations around
                                            the selected visit. The timeline accesses the complete
                                            run.
                                        </p>
                                    )}
                                    <section className="timeline">
                                        <div className="panel-heading">
                                            <div>
                                                <span className="eyebrow">ORDERED VISITS</span>
                                                <h2>Trace timeline</h2>
                                            </div>
                                            <div className="step-controls">
                                                <button
                                                    className="quiet"
                                                    disabled={selectedIndex === 0}
                                                    onClick={() =>
                                                        selectObservation(
                                                            observations[selectedIndex - 1].id,
                                                        )
                                                    }
                                                    aria-label="Previous observation"
                                                >
                                                    ←
                                                </button>
                                                <button
                                                    className="quiet"
                                                    disabled={
                                                        selectedIndex === observations.length - 1
                                                    }
                                                    onClick={() =>
                                                        selectObservation(
                                                            observations[selectedIndex + 1].id,
                                                        )
                                                    }
                                                    aria-label="Next observation"
                                                >
                                                    →
                                                </button>
                                            </div>
                                        </div>
                                        <div className="timeline-list">
                                            {observations
                                                .slice(
                                                    Math.max(0, selectedIndex - 20),
                                                    selectedIndex + 21,
                                                )
                                                .map((item) => (
                                                    <button
                                                        key={item.id}
                                                        className={
                                                            "visit " +
                                                            (item.id === observation.id
                                                                ? "active"
                                                                : "")
                                                        }
                                                        onClick={() => selectObservation(item.id)}
                                                    >
                                                        <span className="visit-number">
                                                            {String(item.sequence).padStart(2, "0")}
                                                        </span>
                                                        <span>
                                                            <strong>
                                                                {displayValue(
                                                                    item.state.properties[
                                                                        "ui.title"
                                                                    ] ?? "Observation",
                                                                ).slice(0, 100)}
                                                            </strong>
                                                            <small>
                                                                {displayValue(
                                                                    item.state.properties[
                                                                        "ui.url"
                                                                    ] ?? item.id,
                                                                ).slice(0, 180)}
                                                            </small>
                                                        </span>
                                                        <span className="visit-widgets">
                                                            {item.state.widgets.length} widgets
                                                        </span>
                                                    </button>
                                                ))}
                                        </div>
                                    </section>
                                </div>
                                {selectedGap ? (
                                    <ObservationGapDetails
                                        source={source}
                                        gap={selectedGap}
                                        onSelectObservation={selectObservation}
                                        onSelectExecution={selectExecution}
                                    />
                                ) : executionId && source.model.executions.has(executionId) ? (
                                    <ExecutionDetails
                                        source={source}
                                        executionId={executionId}
                                        onSelectObservation={selectObservation}
                                    />
                                ) : (
                                    <Details
                                        source={source}
                                        observation={observation}
                                        onSelectExecution={selectExecution}
                                        onSelectObservation={selectObservation}
                                    />
                                )}
                            </div>
                        </div>
                    ) : (
                        <div className="choose-run">
                            <h1>Select a run</h1>
                            <p>Choose an imported run to explore its evidence.</p>
                        </div>
                    )}
                </main>
            )}
            <footer className="footer">
                <span>TESTAR STATE MODEL DASHBOARD</span>
                <span>Local workspace · v{version}</span>
            </footer>
        </div>
    );
}
