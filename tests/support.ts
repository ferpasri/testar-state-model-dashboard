import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repository = fileURLToPath(new URL("../", import.meta.url));
export function sharedCases(): string[] {
    const cache = path.join(repository, ".cache", "specs");
    let marker: { directory: string; files: Record<string, string> };
    try {
        marker = JSON.parse(readFileSync(path.join(cache, "current.json"), "utf8"));
    } catch {
        throw new Error("Run npm run prepare:conformance before testing.");
    }
    if (!/^[0-9]+-[a-f0-9-]+$/u.test(marker.directory)) {
        throw new Error("Invalid conformance cache directory.");
    }
    const root = path.join(cache, marker.directory);
    for (const [relative, expected] of Object.entries(marker.files)) {
        if (
            !relative.startsWith("conformance/") ||
            relative.split(/[\\/]/u).some((part) => part === ".." || part === ".") ||
            relative.includes(":")
        ) {
            throw new Error("Invalid cached conformance path.");
        }
        const actual = createHash("sha256")
            .update(readFileSync(path.join(root, relative)))
            .digest("hex");
        if (actual !== expected) {
            throw new Error("Conformance cache changed; repeat npm run prepare:conformance.");
        }
    }
    return readdirSync(path.join(root, "conformance", "cases"), { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => path.join(root, "conformance", "cases", entry.name));
}
export function fixtureFiles(
    directory: string,
    relative = "",
): Array<{ path: string; file: File }> {
    return readdirSync(path.join(directory, relative), { withFileTypes: true }).flatMap((entry) => {
        const name = path.posix.join(relative, entry.name);
        if (entry.isDirectory()) {
            return fixtureFiles(directory, name);
        }
        const bytes = readFileSync(path.join(directory, name));
        return [{ path: name, file: new File([bytes], entry.name) }];
    });
}
