# Construct and inspect an abstract model

## Choose evidence and rules

Open **Construct model**, select runs under **Model setup**, and choose a preset or edit its JSON. **Build model** displays the graph and collapses setup. **Observation groups** shows comparison values and original memberships. Changing rules, selected runs, or imported sources invalidates the previous result.

| Preset                             | Comparison                                                                                                                       |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Page address and title             | Captured `ui.url` and string `ui.title`, with fragment removal and title-whitespace normalization.                               |
| Page address                       | Captured address, with fragment removal.                                                                                         |
| Page and widget structure          | Address, title, and selected widget role, name/title, and tag descriptions.                                                      |
| Page address and available actions | Address plus action operation and captured target role and name. Target names try `ui.name`, `ui.text`, and `ui.title` in order. |

Inspect the JSON to confirm that property keys exist in the selected evidence. Missing required values produce unmatched explanations. URL session parameters remain significant unless an explicit transform removes them. Rule syntax and interpretation belong to the [shared language reference](https://github.com/ferpasri/testar-abstraction-specs/blob/main/docs/language.md); worked policies are in the [shared examples](https://github.com/ferpasri/testar-abstraction-specs/blob/main/docs/examples.md).

## Inspect the graph

Select a state or link in the graph or the corresponding lists. The inspector opens supporting observations, screenshots, and action executions. Unmatched observations keep their own nodes and explanations. Solid links summarize completed recorded executions. Dashed gray links show observation order where no completed execution connects the observations.

**Model layout** selects Force-directed, Hierarchical, or Circular. **Reapply layout** arranges the graph again; **Fit model** fits the visible window. Rendering options control state labels, action labels, execution counts, and dimming.

**Highlight source** and **Highlight run** emphasize their original contributions. **Show only selected source/run** restricts graph support, counts, and inspector records to that selection. Shared states remain when the selected evidence contributed observations. Highlighting and filtering keep node positions fixed. The graph uses a bounded window; select an outside state or transition from the lists to bring it into view.

## Available actions and unknown outcomes

Action matching requires the available-actions preset or an `actions` section in custom rules. The **Abstract actions** list shows reported availability and matched execution attempts. Selecting an action opens its comparison values, reported scope, execution statuses, and original records. Unmatched records remain under **Actions needing more information**.

Thin dashed amber links lead to one shared **Outcome not observed** marker for available actions without a connected resulting-state transition. Click an individual link to inspect its action, or click the shared marker to choose an action. Failed or unfinished attempts can still lack resulting-state evidence.

**Group unknown-outcome links by state** is unchecked by default. Checking it replaces individual links with one counted link per state; selecting that link lists its contributing actions. **Show actions with unobserved outcomes** hides or shows these visual markers.

Highlighting and filtering use reported availability and execution references. Filtering does not introduce a new marker for an outcome already known from another source. The shared marker and amber links are presentation only: they do not add recorded states or completed transitions to counts or downloads.

## Preserve supporting evidence

An abstract path can combine different runs. Open supporting records before treating it as one recorded sequence. Grouping does not transfer oracle coverage between observations or establish that one tool discovered actions reported by another.

**Download preview** (`abstraction-preview.json`) explains how observations were compared: the selected rules and inputs, groups of matching observations, compared values, and unmatched observations. It answers which observations were grouped and why.

**Download model** (`abstract-model.json`) includes the rules, interpreter identity, input scope, and the constructed abstract states, actions, transitions, and references to supporting evidence. It describes the connected model built from those groups. **Download rules** saves only the JSON definition. Exports can contain captured values. Original screenshots and full records remain in their evidence folders.

See [examples](examples.md) for how rule choices affect a loan-result state and cross-source action support.

## Explore and enrich

When hosted by TESTAR Server, a constructed model offers **Explore and enrich**. After confirmation, it opens the explorer in a new tab and copies the original selected traces and the model's abstraction rules to the server. Review the application URL, limits, inputs, and preparation before starting. If the selected definition contains only state rules, the explorer adds its default action rules and identifies that addition for review. The original dashboard tab retains its constructed model.

The transfer includes recorded values and referenced artifacts, so review the evidence before sharing it with a server. All runs in each transferred trace must be selected. The explorer uses these original records to rebuild and update its own model; it does not execute the downloaded graph. New executions create new evidence traces.

Standalone static hosting retains browser-local inspection and model construction. The exploration button appears only when the hosting server explicitly enables this integration.

## Load and update server evidence

**Load server traces** lists evidence registered in TESTAR Server. Select the traces and load them directly; the same validation and artifact-hash checks used for folder imports apply. Files are read through authenticated server URLs into browser memory, so long Windows disk paths do not pass through the browser folder picker.

After exploration, **Update dashboard model** returns new trace references to the original dashboard tab. It keeps the existing evidence and abstraction rules, loads the new traces, and rebuilds the model. An independently opened explorer offers **Inspect traces in dashboard**, which opens a new dashboard tab with those traces selected. No ZIP extraction is required.

**Copy folder path** in the explorer shows where a trace is stored on the server. Folder imports remain available for standalone dashboard use; browser file-access limitations can still apply to those manually selected folders.
