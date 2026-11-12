import { LIMITS, type InputFile, type Progress } from "./evidence/import";
import { safePath } from "./evidence/common";

export interface ServerTrace {
    id: string;
    label: string;
    fileCount: number;
}
let session: Promise<string> | undefined;
const explorers = new Set<Window>();
const identifier = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/iu;

export function serverHosted(): boolean {
    return (
        typeof document !== "undefined" &&
        document.querySelector('meta[name="testar-server"]') !== null
    );
}
export function registerExplorer(explorer: Window): void {
    for (const previous of explorers) {
        if (previous.closed) {
            explorers.delete(previous);
        }
    }
    explorers.add(explorer);
}
export function knownExplorer(source: MessageEventSource | null): boolean {
    return source !== null && explorers.has(source as Window);
}
export function traceIdentifiers(value: unknown): string[] {
    if (
        !Array.isArray(value) ||
        value.length < 1 ||
        value.length > 20 ||
        value.some((id) => typeof id !== "string" || !identifier.test(id)) ||
        new Set(value).size !== value.length
    ) {
        throw new Error("Select between 1 and 20 distinct server traces.");
    }
    return value;
}
async function api(route: string, signal?: AbortSignal, retry = true): Promise<Response> {
    if (!serverHosted()) {
        throw new Error(
            "Server evidence is available when this dashboard is hosted by TESTAR Server.",
        );
    }
    session ??= fetch("/api/session")
        .then(async (response) => {
            if (!response.ok) {
                throw new Error("Cannot connect to TESTAR Server.");
            }
            const result = await response.json();
            if (typeof result.token !== "string") {
                throw new Error("The server did not provide an access token.");
            }
            return result.token as string;
        })
        .catch((error) => {
            session = undefined;
            throw error;
        });
    const response = await fetch(route, {
        signal,
        headers: { Authorization: "Bearer " + (await session) },
    });
    if (response.status === 401 && retry) {
        session = undefined;
        await response.body?.cancel();
        return api(route, signal, false);
    }
    if (!response.ok) {
        throw new Error("Cannot load server evidence (HTTP " + response.status + ").");
    }
    return response;
}
export async function serverTraces(signal?: AbortSignal): Promise<ServerTrace[]> {
    const records = await (await api("/api/traces", signal)).json();
    if (
        !Array.isArray(records) ||
        records.some(
            (item) =>
                !identifier.test(item.id) ||
                typeof item.label !== "string" ||
                !Number.isSafeInteger(item.fileCount),
        )
    ) {
        throw new Error("The server returned an invalid trace list.");
    }
    return records;
}

/** Download registered files into browser memory, avoiding Windows directory-picker paths. */
export async function readServerTraces(
    ids: string[],
    signal: AbortSignal,
    report: (progress: Progress) => void,
): Promise<InputFile[]> {
    traceIdentifiers(ids);
    const catalog = await serverTraces(signal);
    const pending: { path: string; relative: string; id: string }[] = [];
    for (const id of ids) {
        const trace = catalog.find((item) => item.id === id);
        if (!trace) {
            throw new Error("A selected trace is no longer registered on the server.");
        }
        const names = await (await api(`/api/traces/${id}/files`, signal)).json();
        if (
            !Array.isArray(names) ||
            names.some((name) => typeof name !== "string") ||
            new Set(names).size !== names.length
        ) {
            throw new Error("Invalid server trace filenames.");
        }
        if (names.length > LIMITS.files - pending.length) {
            throw new Error("Selected server traces exceed the 10,000-file import limit.");
        }
        const label = trace.label.replace(/[\\/:\u0000-\u001f]/gu, "-").slice(0, 120) + "-" + id;
        for (const name of names) {
            pending.push({ path: label + "/" + safePath(name), relative: name, id });
        }
    }
    if (pending.length > LIMITS.files) {
        throw new Error("Selected server traces exceed the 10,000-file import limit.");
    }
    let bytes = 0;
    let completed = 0;
    const output: InputFile[] = [];
    // A small batch overlaps local HTTP reads without buffering every screenshot at once.
    for (let offset = 0; offset < pending.length; offset += 4) {
        const files = await Promise.all(
            pending.slice(offset, offset + 4).map(async (entry) => {
                const response = await api(
                    `/api/traces/${entry.id}/file?path=${encodeURIComponent(entry.relative)}`,
                    signal,
                );
                if (!response.body) {
                    throw new Error("The server returned an empty evidence response.");
                }
                const limit =
                    entry.relative === "evidence.jsonl"
                        ? LIMITS.logBytes
                        : entry.relative === "manifest.json"
                          ? LIMITS.recordBytes
                          : LIMITS.artifactBytes;
                const reader = response.body.getReader();
                const chunks: Uint8Array[] = [];
                let size = 0;
                try {
                    while (true) {
                        const part = await reader.read();
                        if (part.done) {
                            break;
                        }
                        size += part.value.byteLength;
                        bytes += part.value.byteLength;
                        if (size > limit || bytes > LIMITS.totalBytes) {
                            throw new Error("Server evidence exceeds the dashboard import limits.");
                        }
                        chunks.push(part.value);
                    }
                } finally {
                    await reader.cancel().catch(() => {});
                    reader.releaseLock();
                }
                const data = new Uint8Array(size);
                let position = 0;
                for (const chunk of chunks) {
                    data.set(chunk, position);
                    position += chunk.byteLength;
                }
                completed++;
                report({ stage: "Loading server evidence", completed, total: pending.length });
                return {
                    path: entry.path,
                    file: new File([data], entry.relative.split("/").at(-1)!),
                };
            }),
        );
        output.push(...files);
    }
    return output;
}
