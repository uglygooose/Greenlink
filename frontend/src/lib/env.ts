const env = import.meta.env;

export const appEnv = env.VITE_APP_ENV ?? "development";

function isLoopbackHost(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1";
}

function isLoopbackUrl(value: string): boolean {
  try {
    return isLoopbackHost(new URL(value).hostname);
  } catch {
    return false;
  }
}

function normalizeBaseUrl(value: string): string {
  if (typeof window === "undefined") {
    return value.replace(/\/$/, "");
  }

  try {
    const url = new URL(value);
    const frontendHostname = window.location.hostname;
    if (
      isLoopbackHost(url.hostname) &&
      isLoopbackHost(frontendHostname) &&
      url.hostname !== frontendHostname
    ) {
      url.hostname = frontendHostname;
    }
    return url.toString().replace(/\/$/, "");
  } catch {
    return value.replace(/\/$/, "");
  }
}

const configuredApiBaseUrl = env.VITE_API_BASE_URL ?? "http://127.0.0.1:8000";

export const apiBaseUrl =
  typeof window !== "undefined" && appEnv === "development" && isLoopbackUrl(configuredApiBaseUrl)
    ? ""
    : normalizeBaseUrl(configuredApiBaseUrl);
