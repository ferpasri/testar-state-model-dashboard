import { testRunForSequence, compareIndex } from "./evidence/reconstructed-evidence";
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
import { ObservationOrderLinkDetails } from "./ObservationOrderLinkDetails";
import { observationOrderLinks } from "./evidence/trace";
import type { EvidenceReference, ExecutionReference } from "./analysis";
const AbstractionPreview = lazy(() =>
    import("./AbstractionPreview").then((module) => ({ default: module.AbstractionPreview })),
);
const Graph = lazy(() => import("./Graph").then((module) => ({ default: module.Graph })));
import type { ImportedSource, Progress } from "./evidence/import";
import { displayValue } from "./evidence/common";
import { version } from "../package.json";

export function App() {
    const [sources, setSources] = useState<ImportedSource[]>([]);
    const [view, setView] = useState<"traces" | "construction">("traces");
    const [abstractionOpened, setAbstractionOpened] = useState(false);
    const [sourceId, setSourceId] = useState("");
    const [runId, setRunId] = useState("");
    const [sequenceId, setSequenceId] = useState("");
    const [observationId, setObservationId] = useState("");
    const [executionId, setExecutionId] = useState("");
    const [orderLinkId, setOrderLinkId] = useState("");
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
                ? Array.from(source.evidence.observations.values())
                      .filter(
                          (item) =>
                              testRunForSequence(source.evidence, item.test_sequence) === runId &&
                              (!sequenceId || item.test_sequence === sequenceId),
                      )
                      .sort(
                          (left, right) =>
                              compareIndex(
                                  source.evidence.sequences.get(left.test_sequence)!.sequence_index,
                                  source.evidence.sequences.get(right.test_sequence)!
                                      .sequence_index,
                              ) || compareIndex(left.observation_index, right.observation_index),
                      )
                : [],
        [source, runId, sequenceId],
    );
    const observation = observations.find((item) => item.id === observationId) ?? observations[0];
    const selectObservation = useCallback((id: string) => {
        setObservationId(id);
        setExecutionId("");
        setOrderLinkId("");
    }, []);
    const selectExecution = useCallback((id: string) => {
        setExecutionId(id);
        setOrderLinkId("");
    }, []);
    const selectOrderLink = useCallback((id: string) => {
        setOrderLinkId(id);
        setExecutionId("");
    }, []);
    const orderLinks = useMemo(
        () => (source ? observationOrderLinks(source.evidence, observations) : []),
        [source, observations],
    );
    const selectedOrderLink = orderLinks.find((orderLink) => orderLink.id === orderLinkId);
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
                    observations: counts.observations + item.evidence.observations.size,
                    executions: counts.executions + item.evidence.executions.size,
                    oracleResults: counts.oracleResults + item.evidence.oracleResults.length,
                }),
                { observations: 0, executions: 0, oracleResults: 0 },
            ),
        [sources],
    );

    function selectRun(item: ImportedSource, id: string) {
        setView("traces");
        setSourceId(item.id);
        setRunId(id);
        setSequenceId("");
        setObservationId("");
        setExecutionId("");
        setOrderLinkId("");
    }
    function openOriginalObservation(reference: EvidenceReference) {
        const originalSource = sources.find((item) => item.id === reference.source);
        const original = originalSource?.evidence.observations.get(reference.observation);
        if (
            !originalSource ||
            !original ||
            testRunForSequence(originalSource.evidence, original.test_sequence) !== reference.run
        ) {
            return;
        }
        selectRun(originalSource, reference.run);
        setSequenceId(original.test_sequence);
        setObservationId(reference.observation);
    }
    function openOriginalExecution(reference: ExecutionReference) {
        const originalSource = sources.find((item) => item.id === reference.source);
        const original = originalSource?.evidence.executions.get(reference.execution);
        if (
            !originalSource ||
            !original ||
            testRunForSequence(originalSource.evidence, original.execution.test_sequence) !==
                reference.run
        ) {
            return;
        }
        selectRun(originalSource, reference.run);
        setSequenceId(original.execution.test_sequence);
        setObservationId(original.execution.source_observation);
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
                    selectRun(first, first.evidence.runs.keys().next().value ?? "");
                }
                cancel();
            }
        };
        instance.onerror = () => {
            setError(
                "The import worker stopped unexpectedly. Try a smaller evidence or check the browser console.",
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
            setOrderLinkId("");
        }
    }
    const directoryAttributes = {
        webkitdirectory: "",
        directory: "",
    } as InputHTMLAttributes<HTMLInputElement>;
    return (
        <div className={sources.length === 0 ? "application welcome-page" : "application"}>
            <header className="topbar">
                <div className="brand">
                    <span className="brand-mark">t.</span>
                    <div>
                        <strong>TESTAR</strong>
                        <span>STATE MODEL / EVIDENCE DASHBOARD</span>
                    </div>
                </div>
                {sources.length > 0 && (
                    <nav className="workspace-views" aria-label="Workspace view">
                        <button aria-pressed={view === "traces"} onClick={() => setView("traces")}>
                            Trace inspection
                        </button>
                        <button
                            aria-pressed={view === "construction"}
                            onClick={() => {
                                setAbstractionOpened(true);
                                setView("construction");
                            }}
                        >
                            Construct model
                        </button>
                    </nav>
                )}
                <div className="topbar-actions">
                    <span className="local-badge">
                        <span /> Files stay in this browser
                    </span>
                    {sources.length > 0 && (
                        <button
                            className="primary"
                            disabled={busy}
                            onClick={() => fileInput.current?.click()}
                        >
                            Add evidence folder <span aria-hidden="true">↗</span>
                        </button>
                    )}
                </div>
                <input
                    ref={fileInput}
                    type="file"
                    {...directoryAttributes}
                    multiple
                    hidden
                    aria-label="Evidence directory"
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
                    <div className="welcome-intro">
                        <span className="eyebrow">TEST EVIDENCE DASHBOARD</span>
                        <h1>Inspect your test evidence</h1>
                        <p>
                            Inspect individual test executions and combine their evidence into an
                            abstract model.
                        </p>
                        <button
                            className="primary large"
                            disabled={busy}
                            onClick={() => fileInput.current?.click()}
                        >
                            Open evidence folder <span aria-hidden="true">↗</span>
                        </button>
                    </div>
                    <div className="welcome-foot">
                        <div>
                            <span>01 / LOAD TRACES</span>
                            <p>
                                Open an evidence folder, or a parent folder containing several
                                traces.
                            </p>
                        </div>
                        <div>
                            <span>02 / INSPECT TRACES</span>
                            <p>
                                Follow each test sequence and inspect its states, actions,
                                screenshots, widgets, properties, and oracle results.
                            </p>
                        </div>
                        <div>
                            <span>03 / BUILD AN ABSTRACT MODEL</span>
                            <p>
                                Combine traces using abstraction rules to reveal shared states and
                                transitions. Each part keeps links to the original evidence.
                            </p>
                        </div>
                    </div>
                </main>
            ) : (
                <main
                    className={
                        view === "construction" ? "workspace constructing-model" : "workspace"
                    }
                >
                    <aside className="sidebar" hidden={view !== "traces"}>
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
                                <span>observations</span>
                            </div>
                            <div>
                                <strong>{totals.executions}</strong>
                                <span>action executions</span>
                            </div>
                            <div>
                                <strong>{totals.oracleResults}</strong>
                                <span>oracle results</span>
                            </div>
                        </div>

                        <div className="source-list">
                            {sources.map((item) => (
                                <section className="source" key={item.id}>
                                    <div className="source-heading">
                                        <strong title={item.evidence.manifest.evidence_id}>
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
                                    {Array.from(item.evidence.runs.values()).map((run) => (
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
                                    {item.evidence.runs.size === 0 && (
                                        <p className="muted">
                                            This evidence contains no recorded runs.
                                        </p>
                                    )}
                                </section>
                            ))}
                        </div>
                        <p className="sidebar-note">
                            Imported sources remain separate. Select a run to follow its recorded
                            execution history.
                        </p>
                    </aside>
                    {abstractionOpened && (
                        <div className="comparison-workspace" hidden={view !== "construction"}>
                            <Suspense
                                fallback={
                                    <p className="notice">Preparing abstraction preview...</p>
                                }
                            >
                                <AbstractionPreview
                                    sources={sources}
                                    active={view === "construction"}
                                    onOpenObservation={openOriginalObservation}
                                    onOpenExecution={openOriginalExecution}
                                />
                            </Suspense>
                        </div>
                    )}
                    {source ? (
                        <div className="run-workspace" hidden={view !== "traces"}>
                            <div className="run-banner">
                                <div className="run-identity">
                                    <h2>{source.evidence.runs.get(runId)?.producer}</h2>
                                    <p>
                                        {source.evidence.runs.get(runId)?.reason ??
                                            "Run is still open"}
                                    </p>
                                </div>
                                <label className="sequence-filter">
                                    Test sequence
                                    <select
                                        aria-label="Test sequence"
                                        value={sequenceId}
                                        onChange={(event) => {
                                            setSequenceId(event.target.value);
                                            setObservationId("");
                                            setExecutionId("");
                                            setOrderLinkId("");
                                        }}
                                    >
                                        <option value="">All test sequences</option>
                                        {[...source.evidence.sequences.values()]
                                            .filter((sequence) => sequence.test_run === runId)
                                            .sort((a, b) =>
                                                compareIndex(a.sequence_index, b.sequence_index),
                                            )
                                            .map((sequence) => (
                                                <option key={sequence.id} value={sequence.id}>
                                                    {"Sequence " +
                                                        sequence.sequence_index +
                                                        " · " +
                                                        sequence.status +
                                                        " · " +
                                                        sequence.source_sequence}
                                                </option>
                                            ))}
                                    </select>
                                </label>
                                <div className="run-count">
                                    {observations.length}
                                    <span>observations</span>
                                </div>
                            </div>
                            {observation ? (
                                <div className="evidence-layout">
                                    <div className="trace-column">
                                        <Suspense
                                            fallback={
                                                <p className="notice">Preparing trace graph…</p>
                                            }
                                        >
                                            <Graph
                                                evidence={source.evidence}
                                                observations={graphObservations}
                                                selected={observation.id}
                                                onSelect={selectObservation}
                                                selectedExecution={executionId}
                                                onSelectExecution={selectExecution}
                                                orderLinks={orderLinks}
                                                selectedOrderLink={orderLinkId}
                                                onSelectOrderLink={selectOrderLink}
                                            />
                                        </Suspense>
                                        {observations.length > 1000 && (
                                            <p className="notice">
                                                Graph shows a window of up to 1,000 observations
                                                around the selected observation. The timeline
                                                accesses the complete run.
                                            </p>
                                        )}
                                        <section className="timeline">
                                            <div className="panel-heading">
                                                <div>
                                                    <span className="eyebrow">
                                                        ORDERED OBSERVATIONS
                                                    </span>
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
                                                            selectedIndex ===
                                                            observations.length - 1
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
                                                                "observation " +
                                                                (item.id === observation.id
                                                                    ? "active"
                                                                    : "")
                                                            }
                                                            onClick={() =>
                                                                selectObservation(item.id)
                                                            }
                                                        >
                                                            <span
                                                                className="observation-number"
                                                                title={
                                                                    "Test sequence " +
                                                                    source.evidence.sequences.get(
                                                                        item.test_sequence,
                                                                    )!.sequence_index
                                                                }
                                                            >
                                                                {String(
                                                                    item.observation_index,
                                                                ).padStart(2, "0")}
                                                            </span>
                                                            <span>
                                                                <strong>
                                                                    {displayValue(
                                                                        item.recorded_state
                                                                            .properties[
                                                                            "ui.title"
                                                                        ] ?? "Observation",
                                                                    ).slice(0, 100)}
                                                                </strong>
                                                                <small>
                                                                    {displayValue(
                                                                        item.recorded_state
                                                                            .properties["ui.url"] ??
                                                                            item.id,
                                                                    ).slice(0, 180)}
                                                                </small>
                                                            </span>
                                                            <span className="observation-widgets">
                                                                {item.recorded_state.widgets.length}{" "}
                                                                widgets
                                                            </span>
                                                        </button>
                                                    ))}
                                            </div>
                                        </section>
                                    </div>
                                    {selectedOrderLink ? (
                                        <ObservationOrderLinkDetails
                                            source={source}
                                            orderLink={selectedOrderLink}
                                            onSelectObservation={selectObservation}
                                            onSelectExecution={selectExecution}
                                        />
                                    ) : executionId &&
                                      source.evidence.executions.has(executionId) ? (
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
                            ) : (
                                <p className="notice">
                                    No observations were recorded in this selection.
                                </p>
                            )}
                        </div>
                    ) : (
                        <div className="choose-run" hidden={view !== "traces"}>
                            <h1>Select a run</h1>
                            <p>Choose an imported run to inspect its evidence.</p>
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
