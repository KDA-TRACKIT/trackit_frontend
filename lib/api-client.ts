import { getSupabaseBrowser } from "./supabase-browser";
import { apiBase } from "./api-url";
import { recoverSession } from "./api/client";

const API_URL = apiBase();

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const supabase = getSupabaseBrowser();
  const { data } = supabase ? await supabase.auth.getSession() : { data: { session: null } };
  const token = data.session?.access_token;
  const send = (t: string | undefined | null) =>
    fetch(`${API_URL}${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", ...(t ? { Authorization: `Bearer ${t}` } : {}), ...init?.headers },
      credentials: "include",
    });
  let response = await send(token);
  if (response.status === 401 && token) {
    const fresh = await recoverSession();
    if (fresh) response = await send(fresh);
  }
  if (!response.ok) throw new Error(`API request failed: ${response.status}`);
  return response.json() as Promise<T>;
}
