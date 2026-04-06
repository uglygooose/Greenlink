const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1"]);
const LOOPBACK_PORTS = ["8000", "8001", "8002"];
const RETRYABLE_PROXY_ERRORS = new Set(["ECONNREFUSED", "ECONNRESET", "EHOSTUNREACH", "ETIMEDOUT"]);

function normalizeUrl(value: string): string {
  return value.replace(/\/$/, "");
}

export function isLoopbackUrl(value: string): boolean {
  try {
    return LOOPBACK_HOSTS.has(new URL(value).hostname);
  } catch {
    return false;
  }
}

export function buildLoopbackProxyCandidates(baseUrl: string): string[] {
  const primary = normalizeUrl(baseUrl);
  const candidates = [primary];

  if (!isLoopbackUrl(primary)) {
    return candidates;
  }

  const parsed = new URL(primary);
  for (const port of LOOPBACK_PORTS) {
    if (parsed.port === port) continue;
    const candidate = new URL(parsed.toString());
    candidate.port = port;
    candidates.push(normalizeUrl(candidate.toString()));
  }

  return Array.from(new Set(candidates));
}

export function isRetryableProxyError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const code = "code" in error ? error.code : null;
  return typeof code === "string" && RETRYABLE_PROXY_ERRORS.has(code);
}
