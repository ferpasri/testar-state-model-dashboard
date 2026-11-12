import { useEffect, useRef, useState } from "react";
import type { AbstractionPreview } from "testar-abstraction";
import { registerExplorer } from "./server-evidence";
import { formatJson } from "./evidence/common";
import type { ImportedSource } from "./evidence/import";

/** Explicitly pass original evidence to the same-origin explorer without reloading this model. */
export function ExploreAndEnrich({
    preview,
    sources,
}: {
    preview: AbstractionPreview;
    sources: ImportedSource[];
}) {
    const enabled = document.querySelector('meta[name="testar-server"]') !== null;
    const [error, setError] = useState("");
    const [waiting, setWaiting] = useState(false);
    const cleanup = useRef<(() => void) | undefined>(undefined);
    useEffect(() => () => cleanup.current?.(), []);
    if (!enabled) {
        return null;
    }
    function openExplorer() {
        setError("");
        try {
            const traces = preview.inputScope.sources.map((reference) => {
                const source = sources.find((item) => item.id === reference.id)!;
                const selected = new Set(
                    preview.inputScope.runs
                        .filter((run) => run.source === source.id)
                        .map((run) => run.run),
                );
                if ([...source.evidence.runs.keys()].some((run) => !selected.has(run))) {
                    throw new Error(
                        "Select all runs in each selected trace before exploring from it.",
                    );
                }
                if (!source.traceFiles) {
                    throw new Error(
                        "Select the original evidence folders again before transferring them.",
                    );
                }
                const files = [...source.traceFiles].map(([path, file]) => ({ path, file }));
                if (files.reduce((size, item) => size + item.file.size, 0) > 60 * 1024 ** 2) {
                    throw new Error("Each transferred trace must be smaller than 60 MiB.");
                }
                return { files };
            });
            if (
                !window.confirm(
                    "Copy the selected evidence traces, including screenshots and recorded values, to TESTAR Server? The explorer will open in a new tab for you to review the execution settings.",
                )
            ) {
                return;
            }
            cleanup.current?.();
            const explorer = window.open("/explorer/", "_blank");
            if (!explorer) {
                throw new Error("Allow a new tab to open the explorer.");
            }
            registerExplorer(explorer);
            setWaiting(true);
            const stop = () => {
                window.removeEventListener("message", receive);
                window.clearTimeout(timer);
                setWaiting(false);
            };
            const receive = (message: MessageEvent) => {
                if (
                    message.origin !== window.location.origin ||
                    message.source !== explorer ||
                    message.data?.type !== "testar:explorer-ready"
                ) {
                    return;
                }
                explorer.postMessage(
                    {
                        type: "testar:explore-and-enrich",
                        abstraction: formatJson(preview.definition),
                        traces,
                    },
                    window.location.origin,
                );
                stop();
            };
            const timer = window.setTimeout(() => {
                stop();
                setError(
                    "The explorer did not respond. Check that this dashboard is hosted by TESTAR Server.",
                );
            }, 15000);
            cleanup.current = stop;
            window.addEventListener("message", receive);
        } catch (failure) {
            setError(
                failure instanceof Error ? failure.message : "The explorer could not be opened.",
            );
        }
    }
    return (
        <>
            <button onClick={openExplorer} disabled={waiting}>
                {waiting ? "Opening explorer..." : "Explore and enrich"}
            </button>
            {error && <p role="alert">{error}</p>}
        </>
    );
}
