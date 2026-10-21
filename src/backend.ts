import { createClient } from "@supabase/supabase-js";
import type { Workout, Entry } from "./types";
const url = import.meta.env.VITE_SUPABASE_URL,
  key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
export const backend =
  url && key
    ? createClient(url, key, {
        auth: {
          persistSession: false,
          autoRefreshToken: true,
          detectSessionInUrl: true,
        },
        global: {
          fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }),
        },
      })
    : null;
export async function loadPrivate() {
  if (!backend) throw Error("Supabase is not configured.");
  const owner = await backend.from("dashboard_owners").select("user_id");
  if (owner.error || !owner.data?.length)
    throw Error("This account is not provisioned as the dashboard owner.");
  const ws: Workout[] = [],
    entries: Entry[] = [];
  for (let from = 0; ; from += 500) {
    const { data, error } = await backend
      .from("workouts")
      .select("payload")
      .order("source_id")
      .range(from, from + 499);
    if (error) throw Error("Could not load workouts. Please sign in again.");
    ws.push(...data.map((x) => x.payload as Workout));
    if (data.length < 500) break;
  }
  for (let from = 0; ; from += 500) {
    const { data, error } = await backend
      .from("dashboard_entries")
      .select("id,kind,data,updated_at")
      .order("id")
      .range(from, from + 499);
    if (error) throw Error("Could not load dashboard context.");
    entries.push(...(data as Entry[]));
    if (data.length < 500) break;
  }
  const { data: state, error } = await backend
    .from("sync_state")
    .select("*")
    .maybeSingle();
  if (error) throw Error("Could not load sync state.");
  return { workouts: ws, entries, state };
}
export function download(name: string, value: unknown) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
