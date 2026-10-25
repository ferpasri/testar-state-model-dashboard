import { canonical } from "../evidence/common";
import { ABSTRACTION_LIMITS } from "./types";

export class AbstractionLimitError extends Error {}

export class ComparisonBudget {
    private bytes = 0;

    account(value: unknown): void {
        if (Array.isArray(value)) {
            this.add(2 + Math.max(0, value.length - 1));
            for (const item of value) {
                this.account(item);
            }
            return;
        }
        if (value !== null && typeof value === "object") {
            const entries = Object.entries(value);
            this.add(2 + Math.max(0, entries.length - 1));
            for (const [key, item] of entries) {
                this.add(new TextEncoder().encode(JSON.stringify(key)).byteLength + 1);
                this.account(item);
            }
            return;
        }
        this.add(new TextEncoder().encode(canonical(value)).byteLength);
    }

    private add(bytes: number): void {
        this.bytes += bytes;
        if (this.bytes > ABSTRACTION_LIMITS.comparisonBytes) {
            throw new AbstractionLimitError(
                "Comparison data exceeds 32 MiB. Select fewer runs or fewer properties.",
            );
        }
    }
}
