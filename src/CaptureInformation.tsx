import { useState } from "react";
import { Properties } from "./EvidenceFields";
import { ignoredAliasCount, objectValue, omittedProperties } from "./evidence/property-evidence";

const reasons: Record<string, string> = {
    excluded: "Excluded",
    unsupported: "Unsupported",
    unavailable: "Unavailable",
    limit: "Capture limit",
    redacted: "Redacted",
};

export function CaptureDescription({ properties }: { properties: Record<string, unknown> }) {
    const capture = objectValue(properties["evidence.capture"]);
    if (!capture) {
        return null;
    }
    return (
        <section aria-label="Capture description">
            <h3>Capture description</h3>
            <Properties
                values={{
                    Area: capture.area ?? "Not reported",
                    "Widgets collected": capture.widget_selection ?? "Not reported",
                    "Properties collected": capture.property_selection ?? "Not reported",
                    Limits: capture.limits ?? "Not reported",
                }}
            />
            {typeof capture.truncated === "boolean" && (
                <p className={capture.truncated ? "notice" : "muted"}>
                    {capture.truncated
                        ? "The producer reported that a capture limit omitted some information."
                        : "The producer reported no capture truncation."}
                </p>
            )}
        </section>
    );
}

export function PropertyCaptureInformation({
    properties,
}: {
    properties: Record<string, unknown>;
}) {
    const [limit, setLimit] = useState(50);
    const omitted = omittedProperties(properties);
    const ignored = ignoredAliasCount(properties);
    return (
        <>
            {ignored > 0 && (
                <p className="notice">
                    {ignored} alias declarations could not be used. Coverage groups only declared
                    names that are both captured with equal JSON values.
                </p>
            )}
            {omitted.length > 0 && (
                <section aria-label="Known property omissions">
                    <h4>Properties omitted during capture</h4>
                    <p className="muted">
                        These are reported capture omissions. They do not establish that a property
                        was absent from the application or that an oracle never evaluated it.
                    </p>
                    <ul className="coverage-properties">
                        {omitted.slice(0, limit).map((entry, index) => (
                            <li key={entry.property + ":" + index}>
                                <div>
                                    <code>{entry.property.slice(0, 4096)}</code>
                                    {entry.explanation && (
                                        <p className="muted">{entry.explanation.slice(0, 2000)}</p>
                                    )}
                                    {Object.hasOwn(properties, entry.property) && (
                                        <p className="muted">
                                            This key is also present in the captured record.
                                        </p>
                                    )}
                                </div>
                                <span className="badge unrecorded">
                                    {reasons[entry.reason] ?? entry.reason.slice(0, 100)}
                                </span>
                            </li>
                        ))}
                    </ul>
                    {omitted.length > limit && (
                        <button className="quiet" onClick={() => setLimit((value) => value + 50)}>
                            Show more omissions
                        </button>
                    )}
                </section>
            )}
        </>
    );
}
