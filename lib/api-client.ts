import { getSupabaseBrowser } from "./supabase-browser";
import { apiBase } from "./api-url";

const API_URL = apiBase();

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const supabase = getSupabaseBrowser();
  const { data } = supabase ? await supabase.auth.getSession() : { data: { session: null } };
  const token = data.session?.access_token;
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...init?.headers },
    credentials: "include",
  });
  if (!response.ok) throw new Error(`API request failed: ${response.status}`);
  return response.json() as Promise<T>;
}
