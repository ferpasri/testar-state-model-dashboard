export type ModelLayout = "force" | "hierarchical" | "circular";

export interface RenderingOptions {
    layout: ModelLayout;
    showStateLabels: boolean;
    showActionLabels: boolean;
    showExecutionCounts: boolean;
    dimOtherEvidence: number;
}

export const DEFAULT_RENDERING: RenderingOptions = {
    layout: "force",
    showStateLabels: true,
    showActionLabels: true,
    showExecutionCounts: true,
    dimOtherEvidence: 82,
};

export function AbstractModelRenderControls({
    options,
    onChange,
}: {
    options: RenderingOptions;
    onChange: (options: RenderingOptions) => void;
}) {
    return (
        <fieldset className="abstract-model-render-controls abstraction-panel">
            <legend>Rendering options</legend>
            <label className="search-label">
                Model layout
                <select
                    aria-label="Model layout"
                    value={options.layout}
                    onChange={(event) =>
                        onChange({ ...options, layout: event.target.value as ModelLayout })
                    }
                >
                    <option value="force">Force-directed</option>
                    <option value="hierarchical">Hierarchical</option>
                    <option value="circular">Circular</option>
                </select>
            </label>
            <div className="abstract-model-display-options">
                <label className="compact-toggle">
                    <input
                        type="checkbox"
                        checked={options.showStateLabels}
                        onChange={(event) =>
                            onChange({ ...options, showStateLabels: event.target.checked })
                        }
                    />
                    Show state labels
                </label>
                <label className="compact-toggle">
                    <input
                        type="checkbox"
                        checked={options.showActionLabels}
                        onChange={(event) =>
                            onChange({ ...options, showActionLabels: event.target.checked })
                        }
                    />
                    Show action labels
                </label>
                <label className="compact-toggle">
                    <input
                        type="checkbox"
                        checked={options.showExecutionCounts}
                        onChange={(event) =>
                            onChange({ ...options, showExecutionCounts: event.target.checked })
                        }
                    />
                    Show execution counts
                </label>
            </div>
            <label className="search-label abstract-model-dimming">
                Dim other evidence <output>{options.dimOtherEvidence}%</output>
                <input
                    aria-label="Dim other evidence"
                    type="range"
                    min="0"
                    max="100"
                    step="1"
                    value={options.dimOtherEvidence}
                    onChange={(event) =>
                        onChange({ ...options, dimOtherEvidence: Number(event.target.value) })
                    }
                />
            </label>
            <p className="muted">
                Highlight and display changes keep state positions fixed. Change or reapply the
                layout to arrange the graph again.
            </p>
        </fieldset>
    );
}
