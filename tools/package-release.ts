import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { zipSync, type Zippable } from "fflate";

const metadata = JSON.parse(await readFile("package.json", "utf8"));
const files: Zippable = {};
const fixedDate = new Date("2000-01-01T00:00:00Z");

async function collect(directory: string, prefix: string): Promise<void> {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name, "en"));
    for (const entry of entries) {
        const filename = path.join(directory, entry.name);
        const archivePath = `${prefix}/${entry.name}`;
        if (entry.isDirectory()) {
            await collect(filename, archivePath);
        } else if (entry.isFile()) {
            files[archivePath] = [await readFile(filename), { mtime: fixedDate }];
        } else {
            throw new Error(`Release assets must be regular files: ${filename}`);
        }
    }
}

await collect("dist", "dist");
for (const filename of ["LICENSE", "README.md"]) {
    files[filename] = [await readFile(filename), { mtime: fixedDate }];
}
files["release.json"] = [
    Buffer.from(
        JSON.stringify(
            { name: metadata.name, version: metadata.version, entry: "dist/index.html" },
            null,
            4,
        ) + "\n",
    ),
    { mtime: fixedDate },
];
const filename = `${metadata.name}-v${metadata.version}.zip`;
const archive = zipSync(files, { level: 9 });
const checksum = createHash("sha256").update(archive).digest("hex");
await mkdir("target/release", { recursive: true });
await writeFile(path.join("target/release", filename), archive);
await writeFile(path.join("target/release", `${filename}.sha256`), `${checksum}  ${filename}\n`);
console.log(`Release package: target/release/${filename}`);
