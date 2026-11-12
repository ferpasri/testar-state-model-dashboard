import { useRef, useState } from "react";
import { serverHosted, serverTraces, type ServerTrace } from "./server-evidence";

export function ServerTraces({
    disabled,
    onLoad,
}: {
    disabled: boolean;
    onLoad: (ids: string[]) => void;
}) {
    const dialog = useRef<HTMLDialogElement>(null);
    const [traces, setTraces] = useState<ServerTrace[]>([]);
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    if (!serverHosted()) {
        return null;
    }
    async function open() {
        setError("");
        setLoading(true);
        setSelected(new Set());
        dialog.current?.showModal();
        try {
            setTraces((await serverTraces()).reverse());
        } catch (failure) {
            setError(failure instanceof Error ? failure.message : "Cannot list server traces.");
        } finally {
            setLoading(false);
        }
    }
    return (
        <>
            <button className="primary" disabled={disabled} onClick={open}>
                Load server traces
            </button>
            <dialog ref={dialog} className="server-traces" aria-labelledby="server-traces-title">
                <h2 id="server-traces-title">Server traces</h2>
                <p>
                    Load recorded evidence directly, including screenshots. Folder selection and ZIP
                    extraction are unnecessary.
                </p>
                {loading && <p role="status">Finding saved traces...</p>}
                {error && <p role="alert">{error}</p>}
                {!loading && traces.length === 0 && (
                    <p>
                        No traces are registered yet. Run an exploration or import existing evidence
                        into the server.
                    </p>
                )}
                <div className="server-trace-list">
                    {traces.map((trace) => (
                        <label key={trace.id} className="compact-toggle">
                            <input
                                type="checkbox"
                                checked={selected.has(trace.id)}
                                onChange={(event) => {
                                    const next = new Set(selected);
                                    if (event.target.checked) {
                                        next.add(trace.id);
                                    } else {
                                        next.delete(trace.id);
                                    }
                                    setSelected(next);
                                }}
                            />
                            <span>
                                {trace.label}
                                <small>{trace.fileCount} files</small>
                            </span>
                        </label>
                    ))}
                </div>
                <div className="server-trace-actions">
                    <button
                        className="primary"
                        disabled={loading || selected.size === 0 || selected.size > 20}
                        onClick={() => {
                            dialog.current?.close();
                            onLoad([...selected]);
                        }}
                    >
                        Load selected traces
                    </button>
                    <button className="quiet" onClick={() => dialog.current?.close()}>
                        Close
                    </button>
                </div>
            </dialog>
        </>
    );
}
