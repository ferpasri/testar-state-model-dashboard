# TESTAR State Model Dashboard

A browser application for inspecting GUI test evidence and constructing abstract models from multiple recorded traces. Inputs follow [TESTAR Evidence specs](https://github.com/ferpasri/testar-evidence-specs).

Selected evidence is validated and processed locally in browser workers. The server supplies application files. The workspace, selected observations, and constructed model remain in memory until the page reloads.

## Run locally

Use Node.js 24 or newer and Git. npm installs the abstraction dependency selected in [package.json](package.json), builds it through its `prepare` script, and pins the resolved commit in the lockfile. Keep installation scripts enabled.

```sh
npm ci
npm run dev
```

Open the local URL printed by Vite. Choose **Open evidence folder** and select a trace containing `manifest.json`, `evidence.jsonl`, and referenced artifacts, or a parent containing several traces.

**Trace inspection** shows runs, sequences, observations, widgets, screenshots, action executions, oracle results, and recorded coverage. **Construct model** selects runs and abstraction rules, builds a combined graph, and retains links to original evidence. Switching between views preserves the current selections and model.

See the [model-construction guide](docs/abstraction.md), [implemented behavior](docs/SPEC.md), [architecture](docs/architecture.md), and [remaining work](TODO.md).

If a selected file is unavailable, finish recording and select the folder again. On Windows, copying a complete trace to a shorter path can resolve browser access failures. Preserve its internal filenames and relative paths.

## Build and deploy

```sh
npm run build
npm run preview
```

The preview server supports local review. For hosted or self-hosted use, deploy `dist/` through a static server with the [required security headers](docs/SPEC.md#privacy-and-limits).

## Release package

```sh
npm run package:release
npm run test:release
```

Packaging builds the application and creates a versioned ZIP and SHA-256 checksum in `target/release/`. The archive contains `dist/`, the license, README, and `release.json` with the application version and entry file. Asset paths are relative, so the application can be served under `/dashboard/`.

TESTAR Server can download the ZIP and checksum from a pinned GitHub release, verify the checksum, extract the archive, and serve its `dist/` directory. The package contains the compiled application and its bundled browser dependencies.

The release workflow verifies the application and attaches these files when a GitHub release is published. The release tag must match `v` followed by the version in `package.json`. Release verification uses the shared data and Chromium prepared below.

## Verification

Prepare the shared data and browser:

```sh
npm run prepare:conformance
npx playwright install chromium
```

Run the checks:

```sh
npm test
npm run test:browser
```

Preparation downloads the newest published evidence and abstraction specs releases, including prereleases, into ignored `.cache/specs/` and `.cache/abstraction-specs/` directories and records each release and its file hashes. Unit tests use that prepared data offline. Browser tests build and exercise the production application. Repeat preparation when verifying a newer specs release.

## Dependencies and compatibility

[package.json](package.json) records the application version, supported Node.js versions, and selected abstraction tag; the lockfile pins installed dependencies. Evidence compatibility is validated by [the input schemas](src/evidence/schema.ts), separately from software release versions. Related projects share their first two release numbers and advance patches independently.

The [TypeScript abstraction package](https://github.com/ferpasri/testar-abstraction-typescript) implements rule interpretation and model construction. The dashboard owns import, workers, rendering, filtering, and inspection. The language reference, examples, and conformance cases are maintained in [TESTAR Abstraction Specs](https://github.com/ferpasri/testar-abstraction-specs).
