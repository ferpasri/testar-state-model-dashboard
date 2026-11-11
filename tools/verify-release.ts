import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import { chromium } from "@playwright/test";
import { unzipSync } from "fflate";
import { sharedCases } from "../tests/support";

const metadata = JSON.parse(await readFile("package.json", "utf8"));
const filename = `${metadata.name}-v${metadata.version}.zip`;
const archive = await readFile(path.join("target/release", filename));
const checksum = await readFile(path.join("target/release", `${filename}.sha256`), "utf8");
assert.equal(checksum.trim(), `${createHash("sha256").update(archive).digest("hex")}  ${filename}`);
const files = unzipSync(archive);
const release = JSON.parse(Buffer.from(files["release.json"]).toString("utf8"));
assert.equal(release.version, metadata.version);
assert.equal(release.entry, "dist/index.html");
assert.ok(files["LICENSE"]);
assert.ok(
    Object.keys(files).every(
        (name) =>
            name.startsWith("dist/") || ["LICENSE", "README.md", "release.json"].includes(name),
    ),
);
const types: Record<string, string> = {
    ".html": "text/html",
    ".js": "text/javascript",
    ".css": "text/css",
    ".svg": "image/svg+xml",
};
// Serve only the archived files, so this check cannot fall back to the source tree.
const server = createServer((request, response) => {
    const pathname = new URL(request.url ?? "/", "http://localhost").pathname;
    const relative =
        pathname === "/dashboard/" ? "index.html" : pathname.slice("/dashboard/".length);
    const content = pathname.startsWith("/dashboard/") ? files[`dist/${relative}`] : undefined;
    if (!content) {
        response.writeHead(404).end();
        return;
    }
    response.setHeader("Content-Type", types[path.extname(relative)] ?? "application/octet-stream");
    response.setHeader(
        "Content-Security-Policy",
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob:; font-src 'self'; connect-src 'none'; worker-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'",
    );
    response.end(content);
});
await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
try {
    const browser = await chromium.launch();
    try {
        const page = await browser.newPage();
        const errors: string[] = [];
        page.on("pageerror", (error) => errors.push(error.message));
        page.on("response", (response) => {
            if (response.status() >= 400) {
                errors.push(`HTTP ${response.status()}: ${response.url()}`);
            }
        });
        await page.goto(`http://127.0.0.1:${(server.address() as AddressInfo).port}/dashboard/`);
        await page.getByRole("button", { name: "Open evidence folder", exact: true }).waitFor();
        // Importing shared evidence also checks that the packaged worker loads at this prefix.
        const initial = sharedCases().find(
            (directory) => path.basename(directory) === "initial-observation",
        );
        assert.ok(initial, "The prepared shared cases include initial-observation");
        await page.getByLabel("Evidence directory").setInputFiles(initial);
        await page.getByRole("heading", { name: "Observation 1", exact: true }).waitFor();
        await page.getByRole("button", { name: "Construct model", exact: true }).click();
        await page.getByRole("button", { name: "Build model", exact: true }).click();
        await page
            .getByRole("region", { name: "Abstract model graph", exact: true })
            .locator("canvas")
            .first()
            .waitFor();
        assert.deepEqual(errors, []);
        console.log(
            "Release package verified: checksum, assets, /dashboard/ rendering, evidence import, and model construction.",
        );
    } finally {
        await browser.close();
    }
} finally {
    await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
    );
}
