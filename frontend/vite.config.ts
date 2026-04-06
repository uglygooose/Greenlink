import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { buildLoopbackProxyCandidates, isRetryableProxyError } from "./src/lib/dev-proxy";

function isWritableResponse(value: unknown): value is {
  end: (chunk?: string) => void;
  headersSent?: boolean;
  setHeader: (name: string, value: string) => void;
  statusCode: number;
} {
  return Boolean(
    value &&
      typeof value === "object" &&
      "end" in value &&
      "setHeader" in value &&
      "statusCode" in value,
  );
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const proxyTarget = env.VITE_API_BASE_URL || "http://127.0.0.1:8000";
  const proxyCandidates = buildLoopbackProxyCandidates(proxyTarget);
  let resolvedProxyTarget = proxyCandidates[0];
  const attemptKey = Symbol("greenlink.proxy.attempts");
  const targetKey = Symbol("greenlink.proxy.target");

  return {
    plugins: [react()],
    server: {
      proxy: {
        "/api": {
          target: resolvedProxyTarget,
          changeOrigin: true,
          secure: false,
          router: () => resolvedProxyTarget,
          configure(proxy) {
            proxy.on("proxyReq", (_proxyReq, req, _res, options) => {
              const activeTarget = String(options.target ?? resolvedProxyTarget);
              (req as Record<PropertyKey, unknown>)[targetKey] = activeTarget;
              const attempted = (((req as Record<PropertyKey, unknown>)[attemptKey] as Set<string> | undefined) ?? new Set<string>());
              attempted.add(activeTarget);
              (req as Record<PropertyKey, unknown>)[attemptKey] = attempted;
            });

            proxy.on("proxyRes", (_proxyRes, req) => {
              const activeTarget = (req as Record<PropertyKey, unknown>)[targetKey];
              if (typeof activeTarget === "string") {
                resolvedProxyTarget = activeTarget;
              }
            });

            proxy.on("error", (error, req, res) => {
              const attempted = (((req as Record<PropertyKey, unknown>)[attemptKey] as Set<string> | undefined) ?? new Set<string>());
              const nextTarget = proxyCandidates.find((candidate) => !attempted.has(candidate));

              if (nextTarget && isRetryableProxyError(error)) {
                attempted.add(nextTarget);
                (req as Record<PropertyKey, unknown>)[attemptKey] = attempted;
                (req as Record<PropertyKey, unknown>)[targetKey] = nextTarget;
                proxy.web(req, res, {
                  changeOrigin: true,
                  secure: false,
                  target: nextTarget,
                });
                return;
              }

              if (isWritableResponse(res) && !res.headersSent) {
                res.statusCode = 502;
                res.setHeader("Content-Type", "application/json");
                res.end(
                  JSON.stringify({
                    message: `GreenLink local API proxy could not reach the backend. Tried: ${proxyCandidates.join(", ")}`,
                  }),
                );
              }
            });
          },
        },
      },
    },
    test: {
      environment: "jsdom",
      globals: true,
      setupFiles: "./src/test/setup.ts",
    },
  };
});
