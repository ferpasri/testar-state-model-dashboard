import { defineConfig } from "vite";

const contentPolicy =
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob:; font-src 'self'; connect-src 'none'; worker-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";

export default defineConfig({
    base: "./",
    server: { host: "127.0.0.1", headers: { "X-Content-Type-Options": "nosniff" } },
    preview: {
        headers: {
            "Content-Security-Policy": contentPolicy,
            "Referrer-Policy": "no-referrer",
            "X-Content-Type-Options": "nosniff",
        },
    },
    plugins: [
        {
            name: "local-development-policy",
            transformIndexHtml(html, context) {
                if (context.server) {
                    return html.replace(
                        "connect-src 'none'",
                        "connect-src 'self' ws://127.0.0.1:* ws://localhost:*",
                    );
                }
                return html;
            },
        },
    ],
});
