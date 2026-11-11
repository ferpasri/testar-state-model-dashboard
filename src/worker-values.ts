import { JsonNumber } from "testar-evidence";

export interface WorkerValues<T> {
    value: T;
    preciseNumbers: JsonNumber[];
}

/** Keep references to actual numbers so an ordinary object with a text field remains ordinary data. */
export function encodeWorkerValues<T>(value: T): WorkerValues<T> {
    const preciseNumbers = new Set<JsonNumber>();
    const visited = new WeakSet<object>();
    function visit(item: unknown): void {
        if (item === null || typeof item !== "object" || visited.has(item)) {
            return;
        }
        visited.add(item);
        if (item instanceof JsonNumber) {
            preciseNumbers.add(item);
        } else if (item instanceof Map) {
            for (const [key, child] of item) {
                visit(key);
                visit(child);
            }
        } else if (
            Array.isArray(item) ||
            Object.getPrototypeOf(item) === Object.prototype ||
            Object.getPrototypeOf(item) === null
        ) {
            for (const child of Object.values(item)) {
                visit(child);
            }
        }
    }
    visit(value);
    return { value, preciseNumbers: [...preciseNumbers] };
}

/** Structured cloning retains shared references, allowing restoration without copying the evidence again. */
export function decodeWorkerValues<T>(message: WorkerValues<T>): T {
    for (const value of message.preciseNumbers) {
        // Validate its decimal spelling before restoring the class removed by postMessage.
        new JsonNumber(value.text);
        Object.setPrototypeOf(value, JsonNumber.prototype);
        Object.freeze(value);
    }
    return message.value;
}
