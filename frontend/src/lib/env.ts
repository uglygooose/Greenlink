const env = import.meta.env;

export const appEnv = env.VITE_APP_ENV ?? "development";
export const apiBaseUrl = env.VITE_API_BASE_URL ?? "http://localhost:8000";
