import { z } from "zod";

export const identifier = z
    .string()
    .min(1)
    .max(4096)
    .refine(
        (value) => value.trim().length > 0 && !/[\u0000-\u001f\u007f]/u.test(value),
        "Use a nonblank identifier without control characters.",
    );
const properties = z.record(identifier, z.unknown());
const natural = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const targetWidget = identifier.nullable().default(null);
const widget = z.strictObject({ id: identifier, parent: targetWidget, properties });
const state = z.strictObject({
    id: identifier,
    properties,
    widgets: z.array(widget).max(100_000),
    capture: z.enum(["complete", "filtered", "unavailable"]),
});
const candidate = z.strictObject({ action: identifier, target: targetWidget });
const artifact = z.strictObject({
    id: identifier,
    path: identifier,
    media_type: identifier,
    sha256: z.string().regex(/^[a-f0-9]{64}$/u),
    width: natural.positive().nullable().optional(),
    height: natural.positive().nullable().optional(),
});
export const observationSchema = z.strictObject({
    id: identifier,
    run: identifier,
    sequence: natural,
    timestamp_micros: natural,
    state,
    candidates: z.array(candidate),
    artifacts: z.array(artifact),
    candidate_scope: z.enum(["unknown", "generated", "eligible"]).default("unknown"),
});
export const checkTarget = z.discriminatedUnion("kind", [
    z.strictObject({ kind: z.literal("run") }),
    z.strictObject({ kind: z.literal("observation"), observation: identifier }),
    z.strictObject({
        kind: z.literal("state_property"),
        observation: identifier,
        property: identifier,
    }),
    z.strictObject({ kind: z.literal("widget"), observation: identifier, widget: identifier }),
    z.strictObject({
        kind: z.literal("widget_property"),
        observation: identifier,
        widget: identifier,
        property: identifier,
    }),
    z.strictObject({ kind: z.literal("execution"), execution: identifier }),
    z.strictObject({
        kind: z.literal("sequence"),
        from_observation: identifier,
        to_observation: identifier,
    }),
]);
const reading = z.discriminatedUnion("kind", [
    z.strictObject({
        kind: z.literal("value"),
        value: z.unknown().refine((value) => value !== undefined, "A value is required."),
    }),
    z.strictObject({ kind: z.literal("absent") }),
    z.strictObject({ kind: z.literal("unknown") }),
]);
const check = z.strictObject({
    run: identifier,
    name: identifier,
    rule: z.strictObject({
        id: identifier,
        version: identifier.optional(),
        parameters: properties.optional(),
    }),
    target: checkTarget,
    status: z.enum(["passed", "failed", "pending", "unknown", "error"]),
    expected: z.unknown().optional(),
    actual: reading.optional(),
    details: properties.default({}),
});
export const manifestSchema = z.strictObject({ schema_version: z.literal(2), model: identifier });
export const eventSchema = z.strictObject({
    schema_version: z.literal(2),
    id: identifier,
    event: z.discriminatedUnion("kind", [
        z.strictObject({
            kind: z.literal("run_started"),
            data: z.strictObject({
                id: identifier,
                producer: identifier,
                source_run: identifier,
                properties,
            }),
        }),
        z.strictObject({
            kind: z.literal("action_defined"),
            data: z.strictObject({
                id: identifier,
                kind: identifier,
                properties,
            }),
        }),
        z.strictObject({ kind: z.literal("observed"), data: observationSchema }),
        z.strictObject({
            kind: z.literal("action_selected"),
            data: z.strictObject({
                id: identifier,
                run: identifier,
                source: identifier,
                action: identifier,
                target: targetWidget,
                parameters: properties,
            }),
        }),
        z.strictObject({
            kind: z.literal("action_submitted"),
            data: z.strictObject({
                execution: identifier,
                accepted: z.boolean(),
                error: z.string().nullable().default(null),
            }),
        }),
        z.strictObject({
            kind: z.literal("action_result"),
            data: z.strictObject({
                execution: identifier,
                observation: identifier,
            }),
        }),
        z.strictObject({ kind: z.literal("checked"), data: check }),
        z.strictObject({
            kind: z.literal("run_finished"),
            data: z.strictObject({
                run: identifier,
                reason: identifier,
            }),
        }),
    ]),
});
export type Envelope = z.infer<typeof eventSchema>;
export type Observation = z.infer<typeof observationSchema>;
export type Artifact = Observation["artifacts"][number];
export type Check = z.infer<typeof check>;
export type Manifest = z.infer<typeof manifestSchema>;
export type EventData<K extends Envelope["event"]["kind"]> = Extract<
    Envelope["event"],
    { kind: K }
>["data"];
