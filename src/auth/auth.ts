import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let accessToken: string | null = null;
let client: SupabaseClient | null = null;

function isPrivilegedKey(key: string): boolean {
  const privilegedRole = ["service", "role"].join("_");
  const secretPrefix = [["sb", "secret"].join("_"), ""].join("_");

  if (key.startsWith(secretPrefix) || key.includes(privilegedRole)) {
    return true;
  }

  const payload = key.split(".")[1];
  if (!payload) return false;

  try {
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const decoded = typeof window !== "undefined"
      ? window.atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "="))
      : Buffer.from(normalized, "base64").toString("utf-8");

    return decoded.includes(privilegedRole);
  } catch {
    return false;
  }
}

export function getSupabaseClient(): SupabaseClient {
  if (client) return client;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publicKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !publicKey || isPrivilegedKey(publicKey)) {
    throw new Error("Authentication configuration is unavailable or invalid.");
  }

  client = createClient(url, publicKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  return client;
}

export async function signIn(email: string, password: string): Promise<boolean> {
  clearAccessToken();

  try {
    const { data, error } = await getSupabaseClient().auth.signInWithPassword({
      email,
      password,
    });

    if (error || !data.session?.access_token) {
      return false;
    }

    accessToken = data.session.access_token;
    return true;
  } catch {
    clearAccessToken();
    return false;
  }
}

export function getAccessToken(): string | null {
  return accessToken;
}

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export function clearAccessToken(): void {
  accessToken = null;
}
