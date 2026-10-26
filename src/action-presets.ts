import { DEFAULT_PRESETS, type AbstractionRules } from "testar-abstraction";

export const DASHBOARD_PRESETS = [
    ...DEFAULT_PRESETS,
    {
        name: "Page address and available actions",
        description:
            "Compare page addresses and match actions by operation and captured target role and name. Edit the JSON to choose different action properties or input values.",
        definition: {
            version: 1,
            name: "Page address and available actions",
            state: [
                {
                    name: "address",
                    keys: ["ui.url"],
                    required: true,
                    transforms: [{ op: "url", remove_fragment: true }],
                },
            ],
            capture: "same",
            actions: {
                target: [
                    { name: "role", keys: ["ui.role"] },
                    { name: "name", keys: ["ui.name", "ui.text", "ui.title"], required: true },
                ],
            },
        } satisfies AbstractionRules,
    },
];
