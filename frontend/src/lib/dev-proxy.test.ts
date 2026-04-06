import { describe, expect, test } from "vitest";

import { buildLoopbackProxyCandidates, isLoopbackUrl, isRetryableProxyError } from "./dev-proxy";

describe("dev proxy helpers", () => {
  test("builds loopback fallback candidates with the configured target first", () => {
    expect(buildLoopbackProxyCandidates("http://127.0.0.1:8002")).toEqual([
      "http://127.0.0.1:8002",
      "http://127.0.0.1:8000",
      "http://127.0.0.1:8001",
    ]);
  });

  test("does not expand non-loopback targets", () => {
    expect(buildLoopbackProxyCandidates("https://api.example.com")).toEqual(["https://api.example.com"]);
  });

  test("recognizes retryable local proxy errors", () => {
    expect(isRetryableProxyError({ code: "ECONNREFUSED" })).toBe(true);
    expect(isRetryableProxyError({ code: "SOMETHING_ELSE" })).toBe(false);
  });

  test("recognizes loopback urls", () => {
    expect(isLoopbackUrl("http://localhost:8000")).toBe(true);
    expect(isLoopbackUrl("http://127.0.0.1:8001")).toBe(true);
    expect(isLoopbackUrl("https://api.example.com")).toBe(false);
  });
});
