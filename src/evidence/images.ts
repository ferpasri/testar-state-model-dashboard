import { requireEvidence } from "./common";

export function imageDimensions(
    bytes: Uint8Array,
    mediaType: string,
): { width: number; height: number } | null {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let width = 0;
    let height = 0;
    if (mediaType === "image/png") {
        requireEvidence(
            bytes.length >= 24 &&
                [137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value),
            "Invalid PNG signature.",
        );
        requireEvidence(
            String.fromCharCode(...bytes.slice(12, 16)) === "IHDR",
            "PNG is missing its image header.",
        );
        width = view.getUint32(16);
        height = view.getUint32(20);
    } else if (mediaType === "image/jpeg") {
        requireEvidence(
            bytes.length >= 4 && bytes[0] === 255 && bytes[1] === 216,
            "Invalid JPEG signature.",
        );
        let offset = 2;
        while (offset + 4 <= bytes.length) {
            requireEvidence(bytes[offset] === 255, "Invalid JPEG marker.");
            const marker = bytes[offset + 1];
            if (marker === 255) {
                offset++;
                continue;
            }
            if (marker === 218 || marker === 217) {
                break;
            }
            const length = view.getUint16(offset + 2);
            requireEvidence(
                length >= 2 && offset + 2 + length <= bytes.length,
                "Invalid JPEG segment.",
            );
            if (
                [192, 193, 194, 195, 197, 198, 199, 201, 202, 203, 205, 206, 207].includes(marker)
            ) {
                requireEvidence(length >= 8, "Invalid JPEG frame.");
                height = view.getUint16(offset + 5);
                width = view.getUint16(offset + 7);
                break;
            }
            offset += length + 2;
        }
    } else {
        return null;
    }
    requireEvidence(
        width > 0 && height > 0 && width * height <= 16_000_000,
        "Screenshot exceeds the 16-million-pixel limit or has invalid dimensions.",
    );
    return { width, height };
}
