export function removePathParameters(pathname: string, names: string[]): string {
    if (names.length === 0) {
        return pathname;
    }
    const selected = new Set(names);
    return pathname
        .split("/")
        .map((segment) => {
            const parts = segment.split(";");
            if (parts.length === 1) {
                return segment;
            }
            const retained = [parts[0]];
            for (const parameter of parts.slice(1)) {
                const separator = parameter.indexOf("=");
                const encodedName = separator === -1 ? parameter : parameter.slice(0, separator);
                let name: string;
                try {
                    name = decodeURIComponent(encodedName);
                } catch {
                    retained.push(parameter);
                    continue;
                }
                if (!selected.has(name)) {
                    retained.push(parameter);
                }
            }
            return retained.join(";");
        })
        .join("/");
}
