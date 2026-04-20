const rawApiBaseUrl = import.meta.env.VITE_API_BASE_URL as string | undefined;

const normalizedApiBaseUrl = rawApiBaseUrl
  ? rawApiBaseUrl.trim().replace(/\/+$/, "")
  : "";

export function apiUrl(path: string): string {
  if (!normalizedApiBaseUrl) return path;
  if (path.startsWith("/")) return `${normalizedApiBaseUrl}${path}`;
  return `${normalizedApiBaseUrl}/${path}`;
}
