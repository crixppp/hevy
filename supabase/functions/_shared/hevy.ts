export type RawWorkout = {
  id: string;
  start_time: string;
  updated_at: string;
  exercises: unknown[];
  [key: string]: unknown;
};
export type Change = { id: string; payload: RawWorkout | null };
export function validateWorkout(w: any): RawWorkout {
  if (
    !w ||
    typeof w.id !== "string" ||
    !w.id ||
    typeof w.title !== "string" ||
    (w.description != null && typeof w.description !== "string") ||
    !Array.isArray(w.exercises) ||
    !Number.isFinite(Date.parse(w.start_time)) ||
    !Number.isFinite(Date.parse(w.updated_at))
  )
    throw Error("Invalid workout schema");
  const indices = new Set();
  for (const e of w.exercises) {
    if (
      !Number.isInteger(e.index) ||
      indices.has(e.index) ||
      typeof e.exercise_template_id !== "string" ||
      typeof e.title !== "string" ||
      (e.notes != null && typeof e.notes !== "string") ||
      !Array.isArray(e.sets)
    )
      throw Error("Invalid exercise schema");
    indices.add(e.index);
    const si = new Set();
    for (const s of e.sets) {
      if (!Number.isInteger(s.index) || si.has(s.index))
        throw Error("Invalid set index");
      si.add(s.index);
    }
  }
  return w;
}
export async function fetchChanges({
  key,
  since,
  fetcher = fetch,
  sleep = (ms: number) => new Promise((r) => setTimeout(r, ms)),
  deadline = Date.now() + 95000,
}: {
  key: string;
  since: string | null;
  fetcher?: typeof fetch;
  sleep?: (ms: number) => Promise<unknown>;
  deadline?: number;
}) {
  const request = async (path: string) => {
    for (let attempt = 0; attempt < 4; attempt++) {
      if (Date.now() > deadline - 5000)
        throw Error(
          "Sync deadline reached; previous complete dataset preserved",
        );
      let r: Response;
      try {
        r = await fetcher("https://api.hevyapp.com/v1/" + path, {
          method: "GET",
          redirect: "error",
          headers: { "api-key": key, Accept: "application/json" },
          signal: AbortSignal.timeout(Math.min(15000, deadline - Date.now())),
        });
      } catch {
        if (attempt === 3) throw Error("Hevy connection failed");
        await sleep(500 * 2 ** attempt);
        continue;
      }
      if (r.ok) return r.json();
      if ((r.status === 429 || r.status >= 500) && attempt < 3) {
        const raw = r.headers.get("Retry-After");
        const wait = raw
          ? Number.isFinite(Number(raw))
            ? Number(raw) * 1000
            : Date.parse(raw) - Date.now()
          : 500 * 2 ** attempt;
        if (
          !Number.isFinite(wait) ||
          wait > 30000 ||
          Date.now() + wait > deadline
        )
          throw Error("Hevy rate limit; retry later");
        await sleep(Math.max(0, wait));
        continue;
      }
      throw Error(`Hevy HTTP ${r.status}`);
    }
    throw Error("Hevy retries exhausted");
  };
  const before = since ? null : await request("workouts/count");
  const changes = new Map<string, Change>();
  let pages: number | null = null;
  for (let page = 1; page <= 500; page++) {
    const result = await request(
      since
        ? `workouts/events?page=${page}&pageSize=10&since=${encodeURIComponent(since)}`
        : `workouts?page=${page}&pageSize=10`,
    );
    if (
      !Number.isInteger(result.page_count) ||
      result.page_count < 0 ||
      result.page !== page ||
      !Array.isArray(since ? result.events : result.workouts)
    )
      throw Error("Invalid pagination schema");
    if (pages !== null && result.page_count !== pages)
      throw Error("Source changed during pagination; retry");
    pages = result.page_count;
    for (const row of since ? result.events : result.workouts) {
      if (since) {
        if (row.type === "updated") {
          const w = validateWorkout(row.workout);
          if (!changes.has(w.id)) changes.set(w.id, { id: w.id, payload: w });
        } else if (row.type === "deleted" && typeof row.id === "string") {
          if (!changes.has(row.id))
            changes.set(row.id, { id: row.id, payload: null });
        } else throw Error("Unknown event schema");
      } else {
        const w = validateWorkout(row);
        if (changes.has(w.id))
          throw Error("Duplicate full-history page; retry");
        changes.set(w.id, { id: w.id, payload: w });
      }
    }
    if (page >= result.page_count) {
      if (!since) {
        const after = await request("workouts/count");
        if (
          typeof before.workout_count !== "number" ||
          before.workout_count !== after.workout_count ||
          changes.size !== after.workout_count
        )
          throw Error("History changed during reconciliation; retry");
      }
      return [...changes.values()];
    }
  }
  throw Error("History exceeds safe pagination bound");
}
export const ownerAllowed = (userId: string | null, ownerId: string) =>
  !!userId && userId === ownerId;
export function syncAuthorized(
  userId: string | null,
  ownerId: string,
  supplied: string | null,
  secret: string | undefined,
) {
  return (
    ownerAllowed(userId, ownerId) ||
    (!!secret && secret.length >= 32 && supplied === secret)
  );
}
