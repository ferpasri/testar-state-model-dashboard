# Model-inspection examples

These examples illustrate rule choices and presentation. The [dashboard specification](SPEC.md) defines behavior; the abstraction package owns [rule examples](https://github.com/ferpasri/testar-abstraction/blob/main/docs/examples.md) and conformance cases.

## A loan result at the same address

A page keeps a loan form and a result panel in its DOM. The result panel changes from `display: none` to `display: block`, and its status text becomes `Denied`. The address and page title stay the same. A policy comparing only those two state properties can group the form and result together.

Select the captured style and text keys to distinguish those observations. A child's `visibility: visible` does not establish that it is shown when a parent has `display: none`. Use property keys actually present in the trace; generic names and source-specific names may differ. Comparing these properties does not filter hidden widgets out of the recorded evidence.

## Actions reported by different sources

One trace reports five available actions on a page. A later observation executes the fourth action, and another source executes the fifth. When the chosen state and action values match, the abstract model retains all five actions and the two executions.

The other three actions have no matched execution in that evidence. Their amber links lead to the shared unknown-outcome marker. With grouping enabled, one link can summarize all three from the same state. Highlighting a source that supplied no supporting availability records leaves that link dimmed.
