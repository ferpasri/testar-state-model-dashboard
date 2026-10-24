import { describe, expect, it } from "vitest";
import {
    INTERPRETER_VERSION,
    MATCHING_LIMITS,
    parseDefinition,
    previewMatching,
    runKey,
    type AnalysisSource,
    type MatchingDefinition,
    type Transform,
} from "../src/analysis";
import { projectFields } from "../src/analysis/fields";
import { canonical } from "../src/evidence/common";
import { Replay } from "../src/evidence/reconstructed-evidence";

type UrlOptions = Omit<Extract<Transform, { op: "url" }>, "op">;

function normalize(value: string, options: UrlOptions = {}): string {
    return projectFields({ "ui.url": value }, [
        { name: "address", keys: ["ui.url"], transforms: [{ op: "url", ...options }] },
    ]).explanations[0].value as string;
}

function definition(options: UrlOptions = {}): MatchingDefinition {
    return {
        version: 1,
        name: "Address comparison",
        state: [
            {
                name: "address",
                keys: ["ui.url"],
                required: true,
                transforms: [{ op: "url", ...options }],
            },
        ],
        capture: "same",
    };
}

function source(id: string, address: string): AnalysisSource {
    const replay = new Replay({ schema_version: 3, evidence_id: "evidence" });
    replay.apply({
        schema_version: 3,
        id: "started",
        event: {
            event_type: "test_run_started",
            data: { id: "run", producer: "generic", source_run: "run", properties: {} },
        },
    });
    replay.apply({
        schema_version: 3,
        id: "sequence-started",
        event: {
            event_type: "test_sequence_started",
            data: {
                id: "sequence",
                test_run: "run",
                sequence_index: 1,
                source_sequence: "1",
                properties: {},
            },
        },
    });
    replay.apply({
        schema_version: 3,
        id: "captured",
        event: {
            event_type: "observation_recorded",
            data: {
                id: "observation",
                test_sequence: "sequence",
                observation_index: 0,
                timestamp_micros: 0,
                recorded_state: {
                    id: "state",
                    properties: { "ui.url": address },
                    widgets: [],
                    capture: "complete",
                },
                available_action_scope: "unknown",
                available_actions: [],
                artifacts: [],
            },
        },
    });
    return { id, label: id, fingerprint: "fingerprint-" + id, evidence: replay.evidence };
}

describe("explicit URL path parameter normalization", () => {
    it("keeps session-like path parameters unless a rule explicitly selects their names", () => {
        const address = "https://example.test/login.htm;jsessionid=abc123";
        expect(normalize(address)).toBe(address);
        expect(normalize(address, { remove_path_parameters: [] })).toBe(address);
    });

    it("removes every selected parameter from every path segment", () => {
        const address =
            "https://example.test/a;session=one;mode=edit;session=two/b;locale=en;session=three/";
        expect(normalize(address, { remove_path_parameters: ["session"] })).toBe(
            "https://example.test/a;mode=edit/b;locale=en/",
        );
    });

    it("preserves the exact order of unrelated parameters after selected parameters are removed", () => {
        const address = "https://example.test/a;z=1;session=one;a=2;z=3;session=two";
        expect(normalize(address, { remove_path_parameters: ["session"] })).toBe(
            "https://example.test/a;z=1;a=2;z=3",
        );
    });

    it("handles flags and empty values while retaining unrelated empty parameter slots", () => {
        const address = "https://example.test/a;session;;session=;keep;session=two=three;";
        expect(normalize(address, { remove_path_parameters: ["session"] })).toBe(
            "https://example.test/a;;keep;",
        );
    });

    it("uses exact case-sensitive names rather than substring matching", () => {
        const address =
            "https://example.test/a;session=one;Session=two;session_extra=three;mysession=four";
        expect(normalize(address, { remove_path_parameters: ["session"] })).toBe(
            "https://example.test/a;Session=two;session_extra=three;mysession=four",
        );
    });

    it("compares safely decoded parameter names while retaining malformed encodings", () => {
        const address =
            "https://example.test/a;%73ession=one;session%ZZ=two;%E0%A4%A=three;session=four";
        expect(normalize(address, { remove_path_parameters: ["session"] })).toBe(
            "https://example.test/a;session%ZZ=two;%E0%A4%A=three",
        );
    });

    it("keeps encoded separators inside path content and parameter values", () => {
        const address =
            "https://example.test/a%3Bsession=literal;keep=one%3Bsession%3Dtwo;session=remove/b%2Fc";
        expect(normalize(address, { remove_path_parameters: ["session"] })).toBe(
            "https://example.test/a%3Bsession=literal;keep=one%3Bsession%3Dtwo/b%2Fc",
        );
    });

    it("decodes parameter names only after identifying literal separators", () => {
        const address = "https://example.test/a;prefix%3Bsession=keep;session=remove";
        expect(normalize(address, { remove_path_parameters: ["session"] })).toBe(
            "https://example.test/a;prefix%3Bsession=keep",
        );
        expect(normalize(address, { remove_path_parameters: ["prefix;session"] })).toBe(
            "https://example.test/a;session=remove",
        );
    });

    it("treats plus signs in parameter names literally rather than as spaces", () => {
        const address = "https://example.test/a;session+token=keep;session%20token=remove";
        expect(normalize(address, { remove_path_parameters: ["session token"] })).toBe(
            "https://example.test/a;session+token=keep",
        );
    });

    it("preserves path segment boundaries, query encoding, and fragment content", () => {
        const address =
            "https://example.test/;session=one/a;session=two//?note=a%20b%3Bsession%3Dc#part;session=four";
        expect(normalize(address, { remove_path_parameters: ["session"] })).toBe(
            "https://example.test//a//?note=a%20b%3Bsession%3Dc#part;session=four",
        );
    });

    it("does not replace matching text in ordinary path names, values, query parameters, or fragments", () => {
        const address =
            "https://example.test/session;label=session/other;mode=session?session=keep#session";
        expect(normalize(address, { remove_path_parameters: ["session"] })).toBe(address);
    });

    it("combines explicit path, query, and fragment removal", () => {
        const address =
            "https://example.test/a;session=one;locale=en/b;token=two?nonce=three&mode=edit#top";
        expect(
            normalize(address, {
                remove_path_parameters: ["session", "token"],
                remove_query: ["nonce"],
                remove_fragment: true,
            }),
        ).toBe("https://example.test/a;locale=en/b?mode=edit");
    });

    it("retains raw properties and explanations alongside the normalized value", () => {
        const address = "https://example.test/a;session=one";
        const properties = Object.freeze({ "ui.url": address });
        const result = projectFields(properties, [
            {
                name: "address",
                keys: ["ui.url"],
                transforms: [{ op: "url", remove_path_parameters: ["session"] }],
            },
        ]);
        expect(properties["ui.url"]).toBe(address);
        expect(result.explanations[0]).toMatchObject({
            key: "ui.url",
            raw: address,
            value: "https://example.test/a",
            missing: false,
        });
    });

    it("validates selected names and keeps the DSL language version unchanged", () => {
        const valid = definition({ remove_path_parameters: ["session", "token"] });
        expect(parseDefinition(canonical(valid))).toEqual(valid);
        expect(valid.version).toBe(1);
        expect(INTERPRETER_VERSION).toBe("1.1.0");
        for (const names of [
            [""],
            ["x".repeat(257)],
            Array.from({ length: 33 }, (_, index) => "name-" + index),
            [1],
            "session",
        ]) {
            const invalid = definition({ remove_path_parameters: names as string[] });
            expect(() => parseDefinition(canonical(invalid))).toThrow("remove_path_parameters");
        }
    });

    it("keeps existing URL input size and absolute-address validation", () => {
        expect(() =>
            normalize("https://example.test/" + "a".repeat(MATCHING_LIMITS.normalizedValueBytes), {
                remove_path_parameters: ["session"],
            }),
        ).toThrow("1 MiB");
        expect(() =>
            normalize("/relative/a;session=one", {
                remove_path_parameters: ["session"],
            }),
        ).toThrow("absolute URL");
    });

    it("merges different session tokens only under an explicit removal rule", async () => {
        const sources = [
            source("first", "https://example.test/login;session=one"),
            source("second", "https://example.test/login;session=two"),
        ];
        const selected = sources.map((item) => runKey(item.id, "run"));
        const exact = await previewMatching(sources, definition(), selected);
        expect(exact.groups).toHaveLength(2);
        const normalized = await previewMatching(
            sources,
            definition({
                remove_path_parameters: ["session"],
            }),
            selected,
        );
        expect(normalized.groups).toHaveLength(1);
        expect(normalized.groups[0].members).toHaveLength(2);
        expect(normalized.groups[0].members.map((member) => member.stateFields[0].raw)).toEqual([
            "https://example.test/login;session=one",
            "https://example.test/login;session=two",
        ]);
        expect(
            sources[0].evidence.observations.get("observation")!.recorded_state.properties[
                "ui.url"
            ],
        ).toBe("https://example.test/login;session=one");
    });
});
