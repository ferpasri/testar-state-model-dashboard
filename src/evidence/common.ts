export class EvidenceError extends Error {
    constructor(
        message: string,
        public code = "invalid_record",
        public field?: string,
        public event?: string,
    ) {
        super(message);
        this.name = "EvidenceError";
    }
}
export function requireEvidence(condition: unknown, message: string): asserts condition {
    if (!condition) {
        throw new EvidenceError(message);
    }
}
export function safePath(path: string): string {
    requireEvidence(
        path.length <= 4096 && !/[\\:\u0000-\u001f\u007f]/u.test(path),
        "Unsafe relative file path.",
    );
    requireEvidence(
        path.split("/").every((part) => part.length > 0 && part !== "." && part !== ".."),
        "Unsafe relative file path.",
    );
    return path;
}
export function canonical(value: unknown): string {
    if (typeof value === "bigint") {
        return value.toString();
    }
    if (Array.isArray(value)) {
        return "[" + value.map(canonical).join(",") + "]";
    }
    if (value !== null && typeof value === "object") {
        const record = value as Record<string, unknown>;
        return (
            "{" +
            Object.keys(record)
                .sort()
                .map((key) => JSON.stringify(key) + ":" + canonical(record[key]))
                .join(",") +
            "}"
        );
    }
    return JSON.stringify(value);
}
export function formatJson(value: unknown, depth = 0): string {
    const padding = "    ".repeat(depth);
    const childPadding = padding + "    ";
    if (Array.isArray(value)) {
        return value.length === 0
            ? "[]"
            : "[\n" +
                  value.map((item) => childPadding + formatJson(item, depth + 1)).join(",\n") +
                  "\n" +
                  padding +
                  "]";
    }
    if (value !== null && typeof value === "object") {
        const entries = Object.entries(value);
        return entries.length === 0
            ? "{}"
            : "{\n" +
                  entries
                      .map(
                          ([key, item]) =>
                              childPadding +
                              JSON.stringify(key) +
                              ": " +
                              formatJson(item, depth + 1),
                      )
                      .join(",\n") +
                  "\n" +
                  padding +
                  "}";
    }
    return canonical(value);
}
export function parseJson(text: string): unknown {
    let value: unknown;
    try {
        value = JSON.parse(text, (_key: string, item: unknown, context?: { source?: string }) => {
            if (typeof item === "number" && Number.isInteger(item) && !Number.isSafeInteger(item)) {
                requireEvidence(
                    context?.source,
                    "This browser cannot preserve large JSON integers.",
                );
                if (/^-?\d+$/u.test(context.source)) {
                    return BigInt(context.source);
                }
            }
            return item;
        });
    } catch (error) {
        if (error instanceof EvidenceError) {
            throw error;
        }
        throw new EvidenceError("Invalid JSON.");
    }
    const pending = [{ value, depth: 0 }];
    while (pending.length > 0) {
        const item = pending.pop()!;
        requireEvidence(item.depth <= 48, "JSON exceeds the nesting limit of 48.");
        if (item.value !== null && typeof item.value === "object") {
            for (const child of Object.values(item.value)) {
                pending.push({ value: child, depth: item.depth + 1 });
            }
        }
        if (typeof item.value === "number") {
            requireEvidence(Number.isFinite(item.value), "JSON numbers must be finite.");
        }
    }
    return value;
}
export async function digest(bytes: BufferSource): Promise<string> {
    const hash = await crypto.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(hash), (value) => value.toString(16).padStart(2, "0")).join(
        "",
    );
}

export function displayValue(value: unknown): string {
    return (
        (typeof value === "string" ? value : formatJson(value))?.slice(0, 12_000) ?? "Not supplied"
    );
}
