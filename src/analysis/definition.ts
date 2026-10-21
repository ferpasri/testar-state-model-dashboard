import { z } from "zod";
import { canonical, parseJson } from "../evidence/common";
import { MATCHING_LIMITS, type MatchingDefinition } from "./types";

const text = z.string().min(1).max(256);
const keys = z.array(text).min(1).max(8);
const stringValue = z.string().max(4096);
const transform = z.discriminatedUnion("op", [
    z.strictObject({ op: z.literal("trim") }),
    z.strictObject({ op: z.literal("collapse_whitespace") }),
    z.strictObject({ op: z.literal("lowercase") }),
    z.strictObject({
        op: z.literal("replace"),
        find: stringValue.min(1),
        with: stringValue,
    }),
    z.strictObject({
        op: z.literal("map"),
        values: z
            .record(stringValue, stringValue)
            .refine((value) => Object.keys(value).length <= 128, "Use at most 128 mappings."),
    }),
    z.strictObject({
        op: z.literal("url"),
        remove_path_parameters: z.array(text).max(32).optional(),
        remove_query: z.array(text).max(32).optional(),
        remove_fragment: z.boolean().optional(),
    }),
]);
const field = z.strictObject({
    name: text,
    keys,
    required: z.boolean().optional(),
    transforms: z.array(transform).max(12).optional(),
});
const fields = z
    .array(field)
    .max(32)
    .refine(
        (items) => new Set(items.map((item) => item.name)).size === items.length,
        "Field names must be unique.",
    );
const predicate = z.discriminatedUnion("op", [
    z.strictObject({ keys, op: z.literal("present") }),
    z.strictObject({
        keys,
        op: z.literal("equals"),
        value: z
            .unknown()
            .refine((value) => value !== undefined, "A comparison value is required."),
    }),
    z.strictObject({ keys, op: z.literal("contains"), value: stringValue }),
]);
const definitionSchema = z
    .strictObject({
        version: z.literal(1),
        name: text,
        state: fields,
        capture: z.enum(["same", "ignore"]),
        widgets: z
            .strictObject({
                fields: fields.refine(
                    (items) => items.length > 0,
                    "Select at least one widget field.",
                ),
                exclude: z.array(predicate).max(32).optional(),
                hierarchy: z.enum(["flat", "tree"]),
                order: z.enum(["preserve", "sort"]),
                descendants: z.enum(["exclude", "keep"]),
            })
            .optional(),
    })
    .refine(
        (definition) => definition.state.length > 0 || definition.widgets !== undefined,
        "Select state fields or widget fields.",
    );

export function parseDefinition(text: string): MatchingDefinition {
    if (new TextEncoder().encode(text).byteLength > MATCHING_LIMITS.definitionBytes) {
        throw new Error("The matching definition exceeds 64 KiB.");
    }
    const parsed = definitionSchema.safeParse(parseJson(text));
    if (!parsed.success) {
        const issue = parsed.error.issues[0];
        throw new Error("Definition " + (issue.path.join(".") || "root") + ": " + issue.message);
    }
    return parsed.data as MatchingDefinition;
}

export function validateDefinition(definition: MatchingDefinition): MatchingDefinition {
    return parseDefinition(canonical(definition));
}
