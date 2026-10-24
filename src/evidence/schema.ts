import { z } from "zod";

export const identifier = z
    .string()
    .min(1)
    .max(4096)
    .refine(
        (value) => value.trim().length > 0 && !/[\u0000-\u001f\u007f]/u.test(value),
        "Use a nonblank identifier without control characters.",
    );
const u64 = z.union([
    z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    z.bigint().min(0n).max(18446744073709551615n),
]);
const properties = z.record(identifier, z.unknown());
const widget = z.strictObject({
    id: identifier,
    parent: z.union([identifier, z.null()]),
    properties: properties,
});
const recorded_state = z.strictObject({
    id: identifier,
    properties: properties,
    widgets: z.array(widget),
    capture: z.enum(["complete", "filtered", "unavailable"]),
});
const available_action = z.strictObject({
    action_description: identifier,
    target_widget: z.union([identifier, z.null()]),
});
const artifact = z.strictObject({
    id: identifier,
    path: identifier,
    media_type: identifier,
    sha256: z.string().regex(/^[a-f0-9]{64}$/u),
    width: z.union([u64, z.null()]).optional(),
    height: z.union([u64, z.null()]).optional(),
});
const oracle = z.strictObject({
    id: identifier,
    version: identifier.optional(),
    parameters: properties.optional(),
});
const oracle_severity = z.strictObject({
    label: identifier,
    value: z.number().finite().optional(),
});
const observed_value = z.union([
    z.strictObject({
        value_status: z.literal("value"),
        value: z.unknown().refine((value) => value !== undefined, "A value is required."),
    }),
    z.strictObject({
        value_status: z.literal("absent"),
    }),
    z.strictObject({
        value_status: z.literal("unknown"),
    }),
]);
const oracle_target = z.union([
    z.strictObject({
        target_type: z.literal("test_run"),
    }),
    z.strictObject({
        target_type: z.literal("test_sequence"),
    }),
    z.strictObject({
        target_type: z.literal("observation"),
        observation: identifier,
    }),
    z.strictObject({
        target_type: z.literal("state_property"),
        observation: identifier,
        property: identifier,
    }),
    z.strictObject({
        target_type: z.literal("widget"),
        observation: identifier,
        widget: identifier,
    }),
    z.strictObject({
        target_type: z.literal("widget_property"),
        observation: identifier,
        widget: identifier,
        property: identifier,
    }),
    z.strictObject({
        target_type: z.literal("action_execution"),
        action_execution: identifier,
    }),
    z.strictObject({
        target_type: z.literal("observation_range"),
        first_observation: identifier,
        last_observation: identifier,
    }),
]);
const test_run_started = z.strictObject({
    id: identifier,
    producer: identifier,
    source_run: identifier,
    properties: properties,
});
const test_sequence_started = z.strictObject({
    id: identifier,
    test_run: identifier,
    sequence_index: u64.refine((value) => value > 0, "Use a positive index."),
    source_sequence: identifier,
    properties: properties,
});
const action_described = z.strictObject({
    id: identifier,
    action_type: identifier,
    properties: properties,
});
const observation_recorded = z.strictObject({
    id: identifier,
    test_sequence: identifier,
    observation_index: u64,
    timestamp_micros: u64,
    recorded_state: recorded_state,
    available_action_scope: z.enum(["generated", "eligible", "unknown"]),
    available_actions: z.array(available_action),
    artifacts: z.array(artifact),
});
const action_selected = z.strictObject({
    id: identifier,
    test_sequence: identifier,
    source_observation: identifier,
    action_description: identifier,
    target_widget: z.union([identifier, z.null()]),
    parameters: properties,
});
const action_execution_reported = z.strictObject({
    action_execution: identifier,
    outcome: z.enum(["returned", "error"]),
    error: z.union([z.string(), z.null()]),
});
const transition_recorded = z.strictObject({
    action_execution: identifier,
    resulting_observation: identifier,
});
const oracle_result_recorded = z.strictObject({
    test_run: identifier,
    test_sequence: identifier.optional(),
    name: identifier,
    oracle: oracle,
    oracle_target: oracle_target,
    oracle_status: z.enum(["passed", "failed", "pending", "unknown", "error"]),
    expected_value: z
        .unknown()
        .refine((value) => value !== undefined, "A value is required.")
        .optional(),
    observed_value: observed_value.optional(),
    oracle_severity: oracle_severity.optional(),
    oracle_details: properties,
});
const test_sequence_finished = z.strictObject({
    test_sequence: identifier,
    reason: z.string(),
});
const test_run_finished = z.strictObject({
    test_run: identifier,
    reason: z.string(),
});

export const observationSchema = observation_recorded;
export const manifestSchema = z.strictObject({
    schema_version: z.literal(3),
    evidence_id: identifier,
});
export const eventSchema = z.strictObject({
    schema_version: z.literal(3),
    id: identifier,
    event: z.discriminatedUnion("event_type", [
        z.strictObject({
            event_type: z.literal("test_run_started"),
            data: test_run_started,
        }),
        z.strictObject({
            event_type: z.literal("test_sequence_started"),
            data: test_sequence_started,
        }),
        z.strictObject({
            event_type: z.literal("action_described"),
            data: action_described,
        }),
        z.strictObject({
            event_type: z.literal("observation_recorded"),
            data: observation_recorded,
        }),
        z.strictObject({
            event_type: z.literal("action_selected"),
            data: action_selected,
        }),
        z.strictObject({
            event_type: z.literal("action_execution_reported"),
            data: action_execution_reported,
        }),
        z.strictObject({
            event_type: z.literal("transition_recorded"),
            data: transition_recorded,
        }),
        z.strictObject({
            event_type: z.literal("oracle_result_recorded"),
            data: oracle_result_recorded,
        }),
        z.strictObject({
            event_type: z.literal("test_sequence_finished"),
            data: test_sequence_finished,
        }),
        z.strictObject({
            event_type: z.literal("test_run_finished"),
            data: test_run_finished,
        }),
    ]),
});
export type EvidenceEvent = z.infer<typeof eventSchema>;
export type Observation = z.infer<typeof observationSchema>;
export type Artifact = Observation["artifacts"][number];
export type OracleResult = z.infer<typeof oracle_result_recorded>;
export type Manifest = z.infer<typeof manifestSchema>;
export type EventData<K extends EvidenceEvent["event"]["event_type"]> = Extract<
    EvidenceEvent["event"],
    { event_type: K }
>["data"];
