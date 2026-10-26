# Construct and inspect an abstract model

## Choose evidence and rules

Open **Construct model**, select runs under **Model setup**, and choose a preset or edit its JSON. **Build model** displays the graph and collapses setup. **Observation groups** shows comparison values and original memberships. Changing rules, selected runs, or imported sources invalidates the previous result.

| Preset                             | Comparison                                                                                                                       |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Page address and title             | Captured `ui.url` and string `ui.title`, with fragment removal and title-whitespace normalization.                               |
| Page address                       | Captured address, with fragment removal.                                                                                         |
| Page and widget structure          | Address, title, and selected widget role, name/title, and tag descriptions.                                                      |
| Page address and available actions | Address plus action operation and captured target role and name. Target names try `ui.name`, `ui.text`, and `ui.title` in order. |

Inspect the JSON to confirm that property keys exist in the selected evidence. Missing required values produce unmatched explanations. URL session parameters remain significant unless an explicit transform removes them. Rule syntax and interpretation belong to the [shared language reference](https://github.com/ferpasri/testar-abstraction/blob/main/docs/language.md); worked policies are in the [shared examples](https://github.com/ferpasri/testar-abstraction/blob/main/docs/examples.md).

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

**Download model** saves the full model, rules, interpreter identity, input scope, and supporting references. **Download preview** saves comparison explanations and memberships; **Download rules** saves the JSON definition. Exports can contain captured values. Original screenshots and full records remain in their evidence folders.

See [examples](examples.md) for how rule choices affect a loan-result state and cross-source action support.
