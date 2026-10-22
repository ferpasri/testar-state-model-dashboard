import { canonical } from "./common";

export const captureMetadataKeys = new Set([
    "evidence.capture",
    "evidence.omitted_properties",
    "evidence.property_aliases",
]);

export function objectValue(value: unknown): Record<string, unknown> | undefined {
    return value !== null && typeof value === "object" && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : undefined;
}

export interface PropertyGroup {
    name: string;
    aliases: string[];
    results: number;
}

export function propertyGroups(
    properties: Record<string, unknown>,
    results: Map<string, number> = new Map(),
): PropertyGroup[] {
    const names = Object.keys(properties).filter((name) => !captureMetadataKeys.has(name));
    const parents = new Map(names.map((name) => [name, name]));
    const declared = new Map<string, string>();
    function root(name: string): string {
        let current = name;
        while (parents.get(current) !== current) {
            current = parents.get(current)!;
        }
        while (name !== current) {
            const next = parents.get(name)!;
            parents.set(name, current);
            name = next;
        }
        return current;
    }
    for (const [alias, source] of Object.entries(
        objectValue(properties["evidence.property_aliases"]) ?? {},
    )) {
        if (
            typeof source !== "string" ||
            alias === source ||
            !parents.has(alias) ||
            !parents.has(source)
        ) {
            continue;
        }
        if (canonical(properties[alias]) !== canonical(properties[source])) {
            continue;
        }
        parents.set(root(alias), root(source));
        declared.set(alias, source);
    }
    const grouped = new Map<string, string[]>();
    for (const name of names) {
        const identity = root(name);
        const group = grouped.get(identity) ?? [];
        group.push(name);
        grouped.set(identity, group);
    }
    return Array.from(grouped.values(), (members) => {
        const name = members.find((member) => !declared.has(member)) ?? members[0];
        return {
            name,
            aliases: members.filter((member) => member !== name),
            results: members.reduce((total, member) => total + (results.get(member) ?? 0), 0),
        };
    });
}

export function ignoredAliasCount(properties: Record<string, unknown>): number {
    const declarations = objectValue(properties["evidence.property_aliases"]);
    if (!declarations) {
        return properties["evidence.property_aliases"] === undefined ? 0 : 1;
    }
    return Object.entries(declarations).filter(
        ([alias, source]) =>
            typeof source !== "string" ||
            alias === source ||
            captureMetadataKeys.has(alias) ||
            captureMetadataKeys.has(source) ||
            !Object.hasOwn(properties, alias) ||
            !Object.hasOwn(properties, source) ||
            canonical(properties[alias]) !== canonical(properties[source]),
    ).length;
}

export interface OmittedProperty {
    property: string;
    reason: string;
    explanation?: string;
}

export function omittedProperties(properties: Record<string, unknown>): OmittedProperty[] {
    const entries = properties["evidence.omitted_properties"];
    if (!Array.isArray(entries)) {
        return [];
    }
    return entries.flatMap((entry) => {
        const value = objectValue(entry);
        if (!value || typeof value.property !== "string" || typeof value.reason !== "string") {
            return [];
        }
        return [
            {
                property: value.property,
                reason: value.reason,
                ...(typeof value.explanation === "string"
                    ? { explanation: value.explanation }
                    : {}),
            },
        ];
    });
}
