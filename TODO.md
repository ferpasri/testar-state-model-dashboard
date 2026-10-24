# Remaining work

## Evidence format alignment

- [x] Read schema-3 traces and pass the v0.3.0 shared conformance cases.
- [x] Inspect test runs and test sequences without connecting separate sequence histories.
- [x] Preserve oracle severity, observed values, and detailed oracle targets.

## First milestone: local evidence inspection

- [x] Initialize the TypeScript, React, and Vite application, with unit and browser test tooling.
- [x] Prepare shared conformance data from published specs releases and test accepted and rejected cases.
- [x] Implement local evidence-directory selection and validation with useful file/line diagnostics.
- [x] Preserve source identities when loading multiple traces into one workspace.
- [x] Parse and index evidence in a Web Worker, with progress reporting and cancellation.
- [x] Display runs, ordered observations, action executions, and their concrete links.
- [x] Add screenshot, widget, property, and oracle-result inspection panels.
- [x] Filter evaluation results by their reported status.
- [x] Inspect captured items and visits without direct evaluation results.
- [x] Display optional observation-order links with explicit unknown-action explanations.
- [x] Display capture limits, pending evaluations, failed action executions, and incomplete executions clearly.
- [x] Verify safe rendering, file-processing limits, and local-only evidence handling with tests.
- [x] Exercise the dashboard with real recorded evidence and measure responsiveness.

## Relationships and supporting context

- [x] Index selected sources and runs together using scoped record identities.
- [x] Define the first JSON matching language with validated fields, transformations, and widget rules.
- [x] Provide editable address-and-title, address-only, and widget-structure presets using the same interpreter.
- [x] Normalize explicitly named session path parameters while preserving original addresses and titles.
- [x] Preview exact observation groups, comparison explanations, and original visit membership.
- [x] Inspect matching widget descriptions while retaining original widget references and duplicate ambiguity.
- [x] Run bounded matching in a worker with progress and cancellation.
- [x] Download rules and previews with input fingerprints, interpreter version, and membership mappings.
- [x] Add a combined graph whose grouped states and transitions link back to original evidence.
- [x] Retain unmatched visits, incomplete executions, and distinct observation-order links in the derived view.
- [x] Highlight source/run support and inspect original visits, screenshots, and executions.
- [x] Offer layout, label, count, and dimming controls while preserving positions during highlighting and filtering.
- [x] Filter a derived view and its inspector to a source/run contribution while retaining the full model.
- [x] Export the derived model with its matching policy, input fingerprints, and original references.
- [ ] Configure action grouping separately and derive transitions from recorded executions.
- [ ] Add further normalization operations and similarity algorithms as evidence needs become clear.
- [ ] Provide a visual rule editor and richer explanations of individual normalization steps.
- [ ] Broaden matching examples and performance measurements using recordings from different producers.
- [ ] Add search across runs and highlight complete original execution paths.
- [ ] Add user annotations and explainable relationships between sources.
- [ ] Define document and section associations with the specs project.
- [ ] Introduce safe previews for selected documentation and BDD formats.
- [ ] Define workspace export/import and user-controlled browser persistence.

## Capture and evaluation coverage

- [x] Group valid same-record aliases, count nested objects once, and show capture descriptions and known omissions separately from application-property coverage.
- [x] Label and filter reported assessment phases and termination context, preserving sequence scope, recorded statuses, and independent reports.
- [x] Keep dashboard interpretation and default matching rules tool-independent. Interpret shared `evidence.assessment` metadata for reporting phases. Show "Phase not reported" when that metadata is missing, and retain tool-specific properties for raw inspection and user-defined matching rules. Built-in interpretation uses shared evidence fields.
- [ ] Add a dedicated cross-source capture comparison that explains differing producer selections and limitations. Follow the [shared capture-comparison plan](https://github.com/ferpasri/testar-evidence-specs/blob/main/TODO.md#capture-comparison-in-derived-models).
- [ ] Offer offline query oracles over widgets and properties selected through the derived model. Evaluate original captured observations, explain insufficient evidence, and keep new results and coverage separate from the original execution results. Follow the [shared offline-oracle plan](https://github.com/ferpasri/testar-evidence-specs/blob/main/TODO.md#offline-query-oracles-over-captured-evidence).

## Distribution and maintenance

- [ ] Choose and add the project license.
- [ ] Add CI checks, dependency review, and a release process following the shared version policy.
- [ ] Provide static hosting and self-hosting instructions with appropriate security headers.
- [ ] Broaden browser coverage and benchmark larger evidence sets before increasing import limits.
- [ ] Add bounded archive import when packaging requirements are agreed.
