# Implemented dashboard behavior

## Local import

The dashboard accepts a selected evidence directory, or a parent directory containing several traces. A trace contains `manifest.json`, `evidence.jsonl`, and its referenced artifacts. Users can add sources to an existing workspace and remove them individually. Folder names can describe the application, objective, and recording time; import uses the manifest and event records. A completed action connects its before and resulting observations to form a state-action-state trace.

Import validates the current evidence schema. The shared format is defined by the specs project; dashboard release numbers identify application releases separately.

An import worker reads UTF-8 JSONL incrementally, validates record shapes, reconstructs the execution history from events in order, and verifies referenced artifact hashes. A complete final line ends with a newline. Failures identify the affected file and relevant record line. File-access failures identify the affected manifest, evidence log, or artifact and explain how to retry. A file that exists on disk can still be unavailable to the browser, including at long Windows paths. Copying the complete trace to a shorter local path preserves its contents and source fingerprint.

Import is atomic: a failed batch leaves the existing workspace intact. Canceling terminates the worker and discards that batch.

## Evidence and identities

| Component               | Responsibility                                                                                     |
| ----------------------- | -------------------------------------------------------------------------------------------------- |
| `evidence/schema.ts`    | Validate the manifest, event forms, oracle targets, observed values, and named properties.         |
| `EvidenceReconstructor` | Validate Evidence Events and rebuild the recorded execution history in memory.                     |
| `importDirectory`       | Discover traces, stream events, verify files, and assign source fingerprints.                      |
| `import.worker.ts`      | Run import outside interface interaction and report progress.                                      |
| `Graph`                 | Draw observations and completed execution links.                                                   |
| `Details`               | Inspect screenshots, properties, widgets, oracle results, and action executions.                   |
| `App`                   | Manage evidence-source, test-run, and test-sequence selection, import lifecycle, and the timeline. |

Each source fingerprint combines its manifest and the SHA-256 digest of the original JSONL bytes. Referenced artifacts are independently verified. Identical reimports share a source identity. Different evidence remains in separate sources even when record IDs collide.

EvidenceReconstructor validates test runs and their test sequences, increasing sequence and observation indexes, available actions, widget hierarchy, recorded-state identities, action execution results, recorded transitions, and oracle targets. Identical repeated Evidence Events are accepted once. Conflicting repeated identities are rejected. Finishing a test sequence marks its unfinished executions incomplete. A test run finishes after its sequences finish; late oracle results retain their reported targets and statuses.

Properties, supplied null values, and omitted optional values retain their meanings. Unsigned 64-bit indexes and timestamps, and large integer properties, are preserved exactly. The inspector displays the original numeric value.

## Workspace navigation

The top bar switches between **Trace inspection** and **Construct model**. Switching keeps the selected observation, inspector tab, abstraction rules, and constructed model in memory. A model calculation continues while the trace view is visible. Reloading the page clears the workspace.

In **Construct model**, **Model setup** contains the selected runs, preset, and JSON rules. **Build model** displays the graph automatically and collapses setup. **Observation groups** shows the comparison details. Source/run highlighting stays beside the graph; **Rendering options** opens layout and label controls without reserving an empty section above the model.

## Inspection

The timeline orders observations by test sequence and then observation index within the selected test run. The test-sequence selector shows all sequences or one sequence. Selecting an observation updates the graph and inspector. Clicking an execution link opens its own inspector with the action, parameters, status, target widget, and source/result navigation. Selecting an observation returns to its observation inspector. Solid graph edges come from completed executions. Optional dashed links connect adjacent observations in the same test sequence when no completed execution connects that pair. They show observation order only; they do not establish that an action happened. Clicking a dashed link opens an explanation and navigation to its endpoints. These links are derived for display and leave imported observations, executions, and source fingerprints intact. Graph windows do not create links across omitted observations. A run with repeated or visually identical observations retains each observation.

The graph renders up to 1,000 observations around the selected observation. The timeline provides previous/next navigation through the complete run and displays a surrounding window of observations.

The inspector shows PNG/JPEG screenshots, capture scope, state properties, available actions, widgets with parent references, oracle results, and associated executions. Widget text and properties are searchable. Lists and long property previews are bounded; their full underlying records remain in memory.

OracleResultView inspection includes results targeting the selected observation, its test run, its test sequence, an associated execution, or an observation range containing it. Original targets remain visible. Status explanations describe the recorded oracle outcome; pending results on finished runs explicitly identify that the run has ended. A broad evaluation does not establish that individual widget properties were evaluated.

OracleResultView lists support passed, failed, pending, unknown, and error filters, with counts across the entire current list before pagination. Filtering changes the displayed results and preserves recorded coverage. Results show their oracle, oracle target, expected value, observed value, oracle details, and optional oracle severity. Severity preserves the source label and optional numeric value.

The Coverage tab indexes direct observation, state-property, widget, and widget-property targets. Run, sequence, and execution targets retain their broader scope. Widget-level results do not mark all its properties evaluated. Every reported status counts as a recorded result, while passing and failing remain distinct outcomes. Coverage is specific to each observation. It groups names declared in `evidence.property_aliases` only when both keys are captured with equal JSON values. Equal values without a declaration remain separate properties. Each group sums its original-target evaluation records once; the source targets and properties remain unchanged.

Coverage lists captured state properties, widgets, and run observations without direct results. The three shared capture metadata fields are shown as descriptions rather than application properties in coverage counts. A nested property object counts once; evaluating a nested-looking literal key does not evaluate its container. Invalid alias declarations remain visible but are ignored for grouping. Missing results mean no evaluation was recorded for that target; source instrumentation may be incomplete. Absent or uncaptured property targets remain visible in Oracle results, while captured-property lists describe the recorded state. Filters, capture limits, and unavailable data constrain any coverage interpretation.

Capture descriptions show the reported area, widget/property selection, limits, and truncation. Known property omissions are listed separately with their reasons. These omissions leave captured presence or values unknown and do not establish application-level absence.

OracleResultView lists also filter reports by supplied assessment phase: during run, end of run, during sequence, end of sequence, or phase not reported. Shared `evidence.assessment` metadata supplies temporal meaning and termination reason. Counts retain every original report, including repeated and late reports; filtering preserves their sequence targets and recorded statuses.

## Matching across runs

The **Construct model** view compares selected runs from the imported sources. Its shared evidence index scopes identities by source and by the record's run or observation where applicable. Reused IDs in independent sources remain separate. The index counts selected observations, widgets, referenced action descriptions, and executions.

The worker passes selected reconstructed evidence and the chosen preset or JSON definition to `testar-abstraction`. The package owns property selection, normalization, widget and action comparisons, unmatched diagnostics, and processing bounds. See its [language reference](https://github.com/ferpasri/testar-abstraction-specs/blob/main/docs/language.md) and [processing specification](https://github.com/ferpasri/testar-abstraction-specs/blob/main/docs/SPEC.md#processing-limits).

The dashboard's built-in presets and editing workflow are described in the [model-construction guide](abstraction.md). Original values remain available in source inspection.

Observation groups retain original source, run, observation, and widget references. Widget correspondences describe equal projected descriptions with captured selected values, including ambiguity when several widgets in one observation share a description. They do not establish persistent widget identity. Users can filter groups to different runs, repeated observations, or all groups, and open any original observation in the trace inspector.

The preview records its full definition, SHA-256 policy fingerprint, interpreter version, selected runs, and source fingerprints. **Download rules** exports the definition; **Download preview** exports that result and its explanations and mappings. Exports contain references and comparison values, so the original evidence is still needed for screenshots and full inspection.

Matching runs in a separate browser worker with progress and cancellation. Editing the definition or run selection invalidates the previous preview. Changing imported sources also invalidates its input scope. Errors preserve the imported evidence.

## Abstract model

After previewing matches, users can switch between **Observation groups** and **Abstract model**. Model construction runs in the abstraction worker and uses the same selected evidence and policy. Source fingerprints and run references are checked before building the model.

Each observation group becomes a node, including groups with one observation. Each unmatched observation receives its own node and explanation. Every selected observation remains represented.

Completed executions produce directed edges. With action rules, executions share an edge when their ordered endpoint nodes and abstract action agree. Without action rules, the exact original action type determines grouping. Reverse directions remain separate; executions within one node become self-loops. Each edge retains source/run/execution references, with original action IDs, widget targets, and parameters available through those references. Individual supporting executions remain available for inspection.

Observation-order links remain a separate dashed edge type and retain their original endpoint pairs within each run. They do not establish completed executions. Selected, submitted, rejected, incomplete, and unusable result executions remain in a separate list with their recorded status and an explanation.

Clicking a node or edge selects its inspector; keyboard-accessible state and link lists provide the same navigation. Node inspection shows the matching values, original observations, and up to four original screenshots when expanded. Execution-edge inspection lists its contributing executions and links to the original execution inspector. Order-link inspection opens its original endpoint observations.

**Highlight source** and **Highlight run** emphasize supporting nodes and edges. A dimming control adjusts other evidence's opacity. With highlighting alone, counts and inspector lists retain the full model scope. Paths through grouped states can combine evidence from several runs; a displayed path does not itself establish one recorded sequence.

**Show only selected source/run** filters the abstract-model view using original evidence references. A node remains when a selected source/run contributed one of its observations. An edge remains when a completed execution or observation-order pair supports it in that scope. Node members, edge references, counts, screenshot choices, and inspector lists are restricted to the selected contribution. The full-model summary and model download preserve the complete derivation.

**Model layout** offers **Force-directed** (the default), **Hierarchical**, and **Circular** arrangements. Selecting or reapplying a layout intentionally repositions nodes. Highlighting, dimming, label toggles, order-link visibility, and evidence filtering preserve existing positions. State labels, action labels, and execution counts can be shown separately. **Fit model** fits the visible graph window.

Layout, label, dimming, and filtering settings live in memory for the current abstract-model view. They change presentation while the abstraction rules (JSON), original records, and downloaded model retain their full scope.

The graph displays a window of up to 500 graph nodes and 2,000 links. Highlighting and filtering retain that window, even when selected evidence lies outside it. Selecting an outside state or link from the lists loads a new window containing it or its endpoints and applies the chosen layout. Lists expand in bounded batches; the complete abstract model remains available in memory and in downloads.

**Download model** exports the definition, policy fingerprint, interpreter version, input scope, and abstract model with its original-record references. Original screenshots and full records remain in the imported source folders. The graph preserves observation-specific evaluation targets and coverage.

## Privacy and limits

Runtime processing stays in the browser. Imported URLs and strings are displayed as evidence. Screenshots use local object URLs, which are revoked when released. Production policy restricts network connections and external resources; the application bundles its scripts and styles. Configure the hosting server to send the security headers defined in the Vite preview configuration on every response, including worker scripts. Local development permits its loopback WebSocket for live updates.

Import verifies artifact hashes and checks PNG/JPEG headers and pixel limits before preview. The browser performs image decoding and reports preview failures. Other artifact media types retain their references without active previews.

| Limit                          | Value                                             |
| ------------------------------ | ------------------------------------------------- |
| Files selected per import      | 10,000                                            |
| Total selected bytes           | 256 MiB                                           |
| JSONL bytes per model          | 128 MiB                                           |
| Manifest or JSONL record       | 2 MiB                                             |
| Records per JSONL file         | 100,000                                           |
| Individual referenced artifact | 32 MiB                                            |
| JSON nesting                   | 48 levels                                         |
| Preview image                  | 16 million pixels                                 |
| Workspace                      | 20 sources and 512 MiB of referenced source files |

These file-size limits bound input, rather than promising the same amount of browser memory use. The workspace lives in memory and is cleared when the page reloads.

## Verification

Development tooling downloads the newest published specs release, including prereleases, and records its selection and file hashes under ignored `.cache/specs/`. Tests validate that cache and discover all released conformance cases. Preparation checks the network; subsequent tests use the selected data offline.

Unit tests cover accepted and rejected traces, reconstruction, integrity, exact numbers, unsafe inputs, source filtering, bounded graph windows, and action presentation. The shared package tests rule interpretation and abstraction conformance. Browser tests exercise the production build, including directory selection, screenshots, malformed labels, independent sources, mobile layout, cancellation, abstraction and abstract-model navigation, and the runtime network boundary.

## Shared abstraction implementation

Rules, presets, grouping, and abstract-model construction come from the independent `testar-abstraction` package. Its repository owns the language documentation, core tests, and abstraction conformance cases. This dashboard supplies validated reconstructed evidence and retains worker cancellation, rendering, highlighting, and inspection.

## Available actions in the constructed model

The abstraction dependency selected in [package.json](../package.json) supplies optional action matching. A separate preset selects captured target role and name; custom rules can also select action-description properties and input values. The worker returns abstract actions with availability records, recorded and inferred execution relationships, ambiguity, and unmatched-action diagnostics. Downloads retain this data and the rules that produced it.

The action list and inspector open original availability observations and action executions. Scope filtering uses their original source/run references and preserves ambiguity reported by the full model. It does not infer that every tool discovered an action or checked its properties.

For reported available actions without a connected resulting-state transition, graph presentation adds a thin dashed amber link per abstract action leading to one shared **Outcome not observed** marker. These placeholders exist only in the graph presentation; model nodes, transition counts, and downloads retain the original constructed model. Showing, hiding, highlighting, or filtering these markers preserves the graph window and positions. Filtering does not create a new placeholder for an outcome known elsewhere in the full model.

**Group unknown-outcome links by state** is unchecked by default, showing an individual thin link for each action. Checking it combines those links into one per source state, labelled with the number of actions without observed outcomes. Clicking a grouped link lists its contributing actions. Source/run highlighting and filtering use those actions' original availability records. This option changes the graph presentation; the constructed model and downloads retain individual action evidence.
