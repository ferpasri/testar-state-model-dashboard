import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { INTERPRETER_VERSION } from "testar-abstraction";

const repository = fileURLToPath(new URL("../", import.meta.url));
function preparedRoot(dataset: "evidence" | "abstraction"): string {
    const cache = path.join(
        repository,
        ".cache",
        dataset === "evidence" ? "specs" : "abstraction-specs",
    );
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
    return root;
}
export function sharedCases(): string[] {
    const root = preparedRoot("evidence");
    return readdirSync(path.join(root, "conformance", "cases"), { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => path.join(root, "conformance", "cases", entry.name));
}
export function abstractionActionCase(name: string): string {
    const root = preparedRoot("abstraction");
    const manifest = JSON.parse(
        readFileSync(path.join(root, "conformance", "manifest.json"), "utf8"),
    );
    if (
        manifest.case_format_version !== 1 ||
        manifest.evidence_schema !== 3 ||
        manifest.rule_language !== 1 ||
        manifest.behavior_version !== INTERPRETER_VERSION
    ) {
        throw new Error("Unsupported shared abstraction conformance identifiers.");
    }
    if (
        !/^[a-z0-9-]+$/u.test(name) ||
        manifest.suites?.actions?.directory !== "action-cases" ||
        !manifest.suites.actions.cases.includes(name)
    ) {
        throw new Error("Unknown abstraction action case: " + name);
    }
    return path.join(root, "conformance", "action-cases", name);
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
