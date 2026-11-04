import { createHash, randomUUID } from "node:crypto";
import { mkdir, writeFile, rename } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { unzipSync } from "fflate";

const repository = fileURLToPath(new URL("../", import.meta.url));
const headers = {
    Accept: "application/vnd.github+json",
    "User-Agent": "testar-state-model-dashboard",
};

async function download(url: string, limit: number): Promise<Uint8Array> {
    const response = await fetch(url, { headers, signal: AbortSignal.timeout(90_000) });
    if (!response.ok || !response.body) {
        throw new Error("Specs download failed: HTTP " + response.status);
    }
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let length = 0;
    while (true) {
        const result = await reader.read();
        if (result.done) {
            break;
        }
        length += result.value.length;
        if (length > limit) {
            await reader.cancel();
            throw new Error("Specs download exceeds its size limit.");
        }
        chunks.push(result.value);
    }
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.length;
    }
    return bytes;
}

interface Release {
    id: number;
    tag_name: string;
    draft: boolean;
    published_at: string | null;
    zipball_url: string;
}
async function prepare(specsRepository: string, cacheName: string) {
    const cache = path.join(repository, ".cache", cacheName);
    const releases: Release[] = [];
    for (let page = 1; page <= 20; page++) {
        const data = JSON.parse(
            new TextDecoder().decode(
                await download(
                    `https://api.github.com/repos/ferpasri/${specsRepository}/releases?per_page=100&page=` +
                        page,
                    4 * 1024 ** 2,
                ),
            ),
        ) as Release[];
        releases.push(...data);
        if (data.length < 100) {
            break;
        }
        if (page === 20) {
            throw new Error("Specs release discovery exceeds 20 pages.");
        }
    }
    const release = releases
        .filter((item) => !item.draft && item.published_at)
        .sort(
            (left, right) =>
                Date.parse(right.published_at!) - Date.parse(left.published_at!) ||
                right.id - left.id,
        )[0];
    if (!release || !release.zipball_url.startsWith("https://api.github.com/")) {
        throw new Error("No supported published specs release was found.");
    }
    const archive = await download(release.zipball_url, 64 * 1024 ** 2);
    let expanded = 0;
    let entries = 0;
    const extracted = unzipSync(archive, {
        filter: (entry) => {
            if (!/^[^/]+\/conformance\//u.test(entry.name) || entry.name.endsWith("/")) {
                return false;
            }
            const relative = entry.name.split("/").slice(1).join("/");
            if (
                /[\\:\u0000-\u001f]/u.test(relative) ||
                relative.split("/").some((part) => !part || part === "." || part === "..")
            ) {
                throw new Error("Unsafe conformance archive path.");
            }
            expanded += entry.originalSize;
            entries++;
            if (
                entry.originalSize > 32 * 1024 ** 2 ||
                expanded > 128 * 1024 ** 2 ||
                entries > 10_000
            ) {
                throw new Error("Specs archive exceeds extraction limits.");
            }
            return true;
        },
    });
    const directory = String(release.id) + "-" + randomUUID();
    const output = path.join(cache, directory);
    await mkdir(output, { recursive: true });
    const hashes: Record<string, string> = {};
    for (const [name, bytes] of Object.entries(extracted)) {
        const relative = name.split("/").slice(1).join("/");
        if (Object.hasOwn(hashes, relative)) {
            throw new Error("Duplicate conformance archive entry.");
        }
        const destination = path.join(output, relative);
        await mkdir(path.dirname(destination), { recursive: true });
        await writeFile(destination, bytes);
        hashes[relative] = createHash("sha256").update(bytes).digest("hex");
    }
    let caseCount: number;
    if (specsRepository === "testar-abstraction-specs") {
        const manifestPath = Object.keys(extracted).find((name) =>
            name.endsWith("/conformance/manifest.json"),
        );
        if (!manifestPath) {
            throw new Error("Abstraction specs release has no conformance manifest.");
        }
        const manifest = JSON.parse(new TextDecoder().decode(extracted[manifestPath])) as {
            case_format_version: number;
            suites: Record<string, { directory: string; cases: string[] }>;
        };
        if (
            manifest.case_format_version !== 1 ||
            !manifest.suites?.states ||
            !manifest.suites?.actions
        ) {
            throw new Error("Unsupported abstraction conformance manifest.");
        }
        caseCount = 0;
        for (const suite of [manifest.suites.states, manifest.suites.actions]) {
            if (
                !["cases", "action-cases"].includes(suite.directory) ||
                !Array.isArray(suite.cases) ||
                !suite.cases.length
            ) {
                throw new Error("Invalid abstraction conformance suite.");
            }
            for (const name of suite.cases) {
                if (
                    !/^[a-z0-9-]+$/u.test(name) ||
                    ["input.json", "rules.json", "expected.json"].some(
                        (file) => !hashes[`conformance/${suite.directory}/${name}/${file}`],
                    )
                ) {
                    throw new Error(
                        "Abstraction specs release contains incomplete conformance cases.",
                    );
                }
                caseCount++;
            }
        }
    } else {
        const cases = Object.keys(hashes).filter((name) =>
            /^conformance\/cases\/[^/]+\/expected.json$/u.test(name),
        );
        if (
            !cases.length ||
            cases.some(
                (name) =>
                    !hashes[name.replace("expected.json", "manifest.json")] ||
                    !hashes[name.replace("expected.json", "evidence.jsonl")],
            )
        ) {
            throw new Error("Evidence specs release contains incomplete conformance cases.");
        }
        caseCount = cases.length;
    }
    const marker = {
        release: release.tag_name,
        published_at: release.published_at,
        directory,
        archive_sha256: createHash("sha256").update(archive).digest("hex"),
        files: hashes,
    };
    const temporary = path.join(cache, "selection-" + randomUUID() + ".json");
    await writeFile(temporary, JSON.stringify(marker, null, 4));
    await rename(temporary, path.join(cache, "current.json"));
    console.log(`Prepared ${specsRepository} ${release.tag_name}: ${caseCount} conformance cases.`);
}

await prepare("testar-evidence-specs", "specs");
await prepare("testar-abstraction-specs", "abstraction-specs");
