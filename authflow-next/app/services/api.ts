const TOKEN_KEY = "authflow_next_token";

type RequestOptions = RequestInit & {
  token?: string | null;
};

export async function apiRequest<T>(path: string, options: RequestOptions = {}) {
  const headers = new Headers(options.headers);
  if (!headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const token = options.token ?? (typeof window !== "undefined" ? localStorage.getItem(TOKEN_KEY) : null);
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const response = await fetch(path, { ...options, headers });
  const text = await response.text();
  let data: { message?: string } = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = {};
  }
  if (!response.ok) throw new Error(data.message || `Request failed with status ${response.status}.`);
  return data as T;
}

export function mongoList<T>(resource: string, query: Record<string, string | number | undefined> = {}) {
  const params = new URLSearchParams();
  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined && value !== "") params.set(key, String(value));
  });
  const suffix = params.toString() ? `?${params}` : "";
  return apiRequest<Record<string, T[]> & { total: number; page: number; limit: number }>(`/api/mongodb/${resource}${suffix}`);
}

export function mongoCreate<T>(resource: string, body: unknown) {
  return apiRequest<{ item: T }>(`/api/mongodb/${resource}`, { method: "POST", body: JSON.stringify(body) });
}

export function mongoUpdate<T>(resource: string, id: string, body: unknown) {
  return apiRequest<{ item: T }>(`/api/mongodb/${resource}/${id}`, { method: "PUT", body: JSON.stringify(body) });
}

export function mongoDelete(resource: string, id: string) {
  return apiRequest<{ ok: true }>(`/api/mongodb/${resource}/${id}`, { method: "DELETE" });
}
