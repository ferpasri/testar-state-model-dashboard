# testar-state-model-dashboard

A web application for inspecting test evidence from tools that follow [testar-evidence-specs](https://github.com/ferpasri/testar-evidence-specs).

Select a local evidence folder to inspect its test runs, test sequences, ordered observations, action executions, screenshots, widgets, properties, and test-oracle results. Multiple sources can share one workspace while retaining their own identities and execution history. A recorded action connects its before and resulting observations, forming a state-action-state execution trace. Trace folder names help people recognize recordings; the dashboard uses manifest and event identities to load evidence and the selected matching rules to derive models.

Evidence is validated and processed in a browser worker. The server delivers the application files; selected evidence stays on the user's computer. The workspace lives in memory until the page reloads. The same production build supports hosted and self-hosted deployments.

## Run locally

Use Node.js 24 or newer. Run these commands in this repository:

```sh
npm ci
npm run dev
```

Open the local URL printed by Vite. Choose **Open evidence folder** and select a directory containing `manifest.json`, `evidence.jsonl`, and its referenced artifacts. You can also select a parent directory containing several traces, then add further sources to the workspace.

Select a test run in the sidebar, then choose all test sequences or one sequence. Follow visits using the timeline or graph, and use the inspector tabs to examine captured properties, widgets, evaluations, and executions.

In **Evaluations**, click a status to filter results. When assessment phases are reported, filter during-run, end-of-run, during-sequence, or end-of-sequence reports to inspect them separately. Pending results keep their reported status even after a run ends.

**Coverage** groups explicitly declared names for the same captured property when their values agree. Grouped rows show their recorded aliases. Capture descriptions explain the producer's widget and property selection, limits, and truncation; known omissions are listed separately from captured properties.

In **Evaluations**, click a status to filter results. **Coverage** lists captured visits, widgets, and properties with no recorded evaluation; a missing result does not prove an oracle never ran. Dashed graph links connect consecutive observations without a recorded completed action. Click one to inspect what is known, or hide them with **Show observation-order links**.

Choose **Construct model** to connect visits across selected runs. Start with **Page address and title**, inspect or edit the JSON rules, and click **Build model**. This preset compares the captured address and title, so different titles can keep visits separate even at the same address. **Page address** compares only the address; **Page and widget structure** adds widget descriptions to the address and title. The proposed groups retain comparison explanations and links to every original visit. Session parameters are preserved unless you explicitly remove named parameters in the [matching rules](docs/abstraction.md#a-small-json-language).

Switch to **Derived model** to see a combined graph. Click a state or arrow to inspect its contributing visits or executions. Choose a layout and the labels to display, then highlight a source or run to follow its evidence. **Show only selected source/run** restricts the view and inspector to that evidence. Solid arrows summarize completed actions; dashed arrows show observation order where the action is unknown. Visits that could not be matched remain separate nodes with an explanation.

**Download model** saves the graph, its original-record references, and the matching policy and input fingerprints. **Download rules** saves the reusable JSON definition. **Download preview** saves the definition, input fingerprints, comparison explanations, and original-record references. These files can contain captured values; save and share them with the same care as the source evidence. The preview describes the selected policy's matches. Evaluations continue to apply to their original targets.

If the browser cannot read a selected file, finish recording and select the folder again. On Windows, deeply nested folders can make screenshot paths too long for browser access. Copy the complete evidence folder, including its artifacts, to a shorter local path and select that copy. Keep internal filenames and relative paths unchanged.

Create and preview a production build:

```sh
npm run build
npm run preview
```

The preview server is for local review. Deploy the generated `dist/` directory through a production static web server for hosted use, applying the security headers described in [the specification](docs/SPEC.md#privacy-and-limits).

## Verification

Prepare the shared test data and browser once:

```sh
npm run prepare:conformance
npx playwright install chromium
```

Run the checks:

```sh
npm test
npm run test:browser
```

Preparation downloads the newest published specs release, including prereleases, into ignored `.cache/specs/`. It records the selected release and file hashes. Repeat preparation when checking the latest specs, including in CI. Unit tests then use the prepared data offline. Browser tests build the current application before testing its production behavior.

## Technology and versions

The application uses TypeScript, React, Vite, Cytoscape.js, Web Workers, Vitest, and Playwright.

Releases use `0.X.Y`. The `0.X` series is shared with the specs and related state-model projects. Each project increments `Y` independently for fixes and improvements within that series. Evidence compatibility is checked using its `schema_version` and validation rules.

See [implemented behavior and limits](docs/SPEC.md), [the architecture](docs/architecture.md), [matching rules and examples](docs/abstraction.md), and [TODO.md](TODO.md).

The top bar switches between **Trace inspection** and **Construct model**. Switching keeps the selected observation, inspector tab, comparison rules, and constructed model in memory. A model calculation continues while the trace view is visible. Reloading the page clears the workspace.

In **Construct model**, **Model setup** contains the selected runs, preset, and JSON rules. **Build model** displays the graph automatically and collapses setup. **Matching groups** shows the comparison details. Source/run highlighting stays beside the graph; **Rendering options** opens layout and label controls without reserving an empty section above the model.
