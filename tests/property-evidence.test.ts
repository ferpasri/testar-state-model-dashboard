import { expect, test } from "vitest";
import {
    propertyGroups,
    ignoredAliasCount,
    omittedProperties,
} from "../src/evidence/property-evidence";
import { propertiesWithoutResults } from "../src/evidence/coverage";

test("declared aliases share coverage and count each original result once", () => {
    const properties = {
        "source.text": "Ready",
        "ui.text": "Ready",
        "other.text": "Ready",
        "evidence.property_aliases": { "ui.text": "source.text" },
    };
    const before = structuredClone(properties);
    const results = new Map([
        ["source.text", 2],
        ["ui.text", 3],
    ]);
    expect(propertyGroups(properties, results)).toEqual([
        { name: "source.text", aliases: ["ui.text"], results: 5 },
        { name: "other.text", aliases: [], results: 0 },
    ]);
    expect(propertiesWithoutResults(properties, results)).toEqual(["other.text"]);
    expect(properties).toEqual(before);
    expect(results.size).toBe(2);
});

test("alias declarations require captured equal JSON values in that record", () => {
    const properties = {
        first: null,
        second: null,
        width: 32,
        height: 32,
        object: { a: 9007199254740993n, b: [true, null] },
        alternate: { b: [true, null], a: 9007199254740993n },
        "evidence.property_aliases": {
            second: "first",
            height: "missing",
            alternate: "object",
            width: "object",
        },
    };
    const groups = propertyGroups(properties, new Map([["alternate", 1]]));
    expect(groups.find((group) => group.name === "first")?.aliases).toEqual(["second"]);
    expect(groups.find((group) => group.name === "object")).toEqual({
        name: "object",
        aliases: ["alternate"],
        results: 1,
    });
    expect(groups.filter((group) => ["width", "height"].includes(group.name))).toHaveLength(2);
    expect(ignoredAliasCount(properties)).toBe(2);
});

test("alias chains and repeated declarations remain bounded and count one property", () => {
    const properties = {
        a: "same",
        b: "same",
        c: "same",
        "evidence.property_aliases": { a: "b", b: "c", c: "a" },
    };
    expect(propertyGroups(properties, new Map([["a", 1]]))).toEqual([
        { name: "a", aliases: ["b", "c"], results: 1 },
    ]);
});

test("capture descriptions and omissions do not add application properties or invent absent values", () => {
    const properties = {
        "source.attributes": { alt: "Help" },
        "source.attributes.alt": "Help",
        "evidence.capture": { area: "Form" },
        "evidence.omitted_properties": [
            { property: "source.color", reason: "limit", explanation: "Value limit" },
        ],
        "evidence.property_aliases": {},
    };
    expect(propertyGroups(properties)).toHaveLength(2);
    expect(propertiesWithoutResults(properties, new Map([["source.attributes.alt", 1]]))).toEqual([
        "source.attributes",
    ]);
    expect(omittedProperties(properties)).toEqual([
        { property: "source.color", reason: "limit", explanation: "Value limit" },
    ]);
    expect(properties).not.toHaveProperty("source.color");
});

test("malformed optional descriptions cannot create property equivalence", () => {
    const properties = {
        a: 1,
        b: 2,
        "evidence.property_aliases": { a: "b", b: false, missing: "a" },
    };
    expect(propertyGroups(properties)).toHaveLength(2);
    expect(ignoredAliasCount(properties)).toBe(3);
    expect(
        omittedProperties({
            "evidence.omitted_properties": [null, {}, { property: "a", reason: "excluded" }],
        }),
    ).toEqual([{ property: "a", reason: "excluded" }]);
    expect(ignoredAliasCount({ a: 1, "evidence.property_aliases": ["a"] })).toBe(1);
});
