import { createClient } from "npm:@supabase/supabase-js@2.118.0";
import { fetchChanges, syncAuthorized } from "../_shared/hevy.ts";
Deno.serve(async (req) => {
  const origin = Deno.env.get("APP_ORIGIN") ?? "";
  const headers = {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers": "authorization, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Cache-Control": "no-store",
    Vary: "Origin",
  };
  const reply = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...headers, "Content-Type": "application/json" },
    });
  if (req.method === "OPTIONS")
    return new Response(null, { status: 204, headers });
  if (req.method !== "POST") return reply(405, { error: "POST required" });
  const url = Deno.env.get("SUPABASE_URL")!,
    service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    owner = Deno.env.get("OWNER_USER_ID")!;
  const db = createClient(url, service, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  let userId: string | null = null;
  const bearer = req.headers.get("authorization")?.replace(/^Bearer /, "");
  if (bearer) {
    const { data } = await db.auth.getUser(bearer);
    userId = data.user?.id ?? null;
  }
  if (
    !syncAuthorized(
      userId,
      owner,
      req.headers.get("x-sync-secret"),
      Deno.env.get("SYNC_SCHEDULE_SECRET"),
    )
  )
    return reply(401, { error: "Owner authentication required" });
  const token = crypto.randomUUID();
  const cutoff = new Date().toISOString();
  const { data: state, error: lockError } = await db.rpc("acquire_sync", {
    p_owner: owner,
    p_token: token,
  });
  if (lockError)
    return reply(429, {
      error: "Sync is running or was requested recently. Retry in two minutes.",
    });
  const full =
    !state.last_full || Date.now() - Date.parse(state.last_full) > 7 * 86400000;
  const { data: run, error: runError } = await db
    .from("sync_runs")
    .insert({
      owner_id: owner,
      status: "running",
      mode: full ? "full" : "events",
    })
    .select("id")
    .single();
  try {
    if (runError) throw Error("Could not record sync attempt");
    const changes = await fetchChanges({
      key: Deno.env.get("HEVY_API_KEY")!,
      since: full
        ? null
        : new Date(Date.parse(state.last_success) - 300000).toISOString(),
    });
    const { error } = await db.rpc("finish_sync", {
      p_owner: owner,
      p_token: token,
      p_changes: changes,
      p_full: full,
      p_cutoff: cutoff,
    });
    if (error) throw Error("Atomic import failed; previous dataset preserved");
    await db
      .from("sync_runs")
      .update({
        status: "success",
        finished_at: new Date().toISOString(),
        changed: changes.length,
      })
      .eq("id", run.id);
    return reply(200, {
      success: true,
      changed: changes.length,
      mode: full ? "full" : "events",
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Sync failed"; // Messages originate in our adapter; never return bodies/headers from upstream.
    await db.rpc("fail_sync", {
      p_owner: owner,
      p_token: token,
      p_error: message,
    });
    if (run)
      await db
        .from("sync_runs")
        .update({
          status: "failed",
          finished_at: new Date().toISOString(),
          error: message,
        })
        .eq("id", run.id);
    return reply(502, { error: message });
  }
});
