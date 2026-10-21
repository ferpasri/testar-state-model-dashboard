import type { Field, MatchingDefinition } from "./types";

const address: Field = {
    name: "address",
    keys: ["ui.url"],
    required: true,
    transforms: [{ op: "url", remove_fragment: true }],
};
const title: Field = {
    name: "title",
    keys: ["ui.title"],
    required: true,
    transforms: [{ op: "trim" }, { op: "collapse_whitespace" }],
};

function pageFields(): Field[] {
    return [structuredClone(title), structuredClone(address)];
}

export const DEFAULT_PRESETS: Array<{
    name: string;
    description: string;
    definition: MatchingDefinition;
}> = [
    {
        name: "Page address and title",
        description:
            "Compare captured page titles and addresses, ignoring URL fragments and normalizing title whitespace. Session parameters remain part of the address unless the rules remove them.",
        definition: {
            version: 1,
            name: "Page address and title",
            state: pageFields(),
            capture: "same",
        },
    },
    {
        name: "Page address",
        description:
            "Compare captured page addresses, ignoring fragments. Visits to the same address may still show different content.",
        definition: {
            version: 1,
            name: "Page address",
            state: [structuredClone(address)],
            capture: "same",
        },
    },
    {
        name: "Page and widget structure",
        description:
            "Compare page titles, addresses, and a sorted collection of captured roles, names, and tags. Source tools may capture different widget trees.",
        definition: {
            version: 1,
            name: "Page and widget structure",
            state: pageFields(),
            capture: "same",
            widgets: {
                fields: [
                    {
                        name: "role",
                        keys: ["ui.role"],
                        transforms: [{ op: "trim" }, { op: "collapse_whitespace" }],
                    },
                    {
                        name: "name",
                        keys: ["ui.name", "ui.title"],
                        transforms: [{ op: "trim" }, { op: "collapse_whitespace" }],
                    },
                    {
                        name: "tag",
                        keys: ["ui.tag"],
                        transforms: [{ op: "trim" }, { op: "collapse_whitespace" }],
                    },
                ],
                hierarchy: "flat",
                order: "sort",
                descendants: "exclude",
            },
        },
    },
];
