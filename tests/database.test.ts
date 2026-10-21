import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
const owner = "11111111-1111-4111-8111-111111111111",
  other = "22222222-2222-4222-8222-222222222222",
  token = "33333333-3333-4333-8333-333333333333";
let db: PGlite;
beforeAll(async () => {
  db = new PGlite();
  await db.exec(
    `create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;grant usage on schema public,auth to anon,authenticated,service_role;grant execute on function auth.uid() to anon,authenticated,service_role;`,
  );
  await db.exec(
    readFileSync("supabase/migrations/202610210001_core.sql", "utf8"),
  );
  await db.exec(
    `insert into auth.users values('${owner}'),('${other}');insert into dashboard_owners values('${owner}');`,
  );
}, 30000);
afterAll(async () => {
  await db.close();
});
const asUser = async (role: string, user: string, sql: string) => {
  await db.exec(`set role ${role};set request.jwt.claim.sub='${user}';`);
  try {
    return await db.query<any>(sql);
  } finally {
    await db.exec("reset role;reset request.jwt.claim.sub;");
  }
};
const workout = (id = "workout-a", title = "Before update") => ({
  id,
  title,
  start_time: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  exercises: [
    {
      index: 0,
      exercise_template_id: "bench",
      title: "Bench",
      notes: null,
      superset_id: null,
      sets: [{ index: 0, type: "normal", weight_kg: 50, reps: 6, rpe: null }],
    },
  ],
});
const commit = async (changes: any[], full = true) => {
  await db.query("select finish_sync($1,$2,$3::jsonb,$4,$5::timestamptz)", [
    owner,
    token,
    JSON.stringify(changes),
    full,
    "2026-01-01T00:00:00Z",
  ]);
};
describe.sequential("real local Postgres migration and access control", () => {
  it("denies anonymous direct table access and private RPC calls", async () => {
    await expect(
      asUser("anon", "", `select * from workouts`),
    ).rejects.toThrow();
    await expect(
      asUser("anon", "", `select acquire_sync('${owner}','${token}')`),
    ).rejects.toThrow();
  });
  it("imports atomically and normalized views preserve provenance", async () => {
    await db.query("select acquire_sync($1,$2)", [owner, token]);
    await commit([{ id: "workout-a", payload: workout() }]);
    const a = await asUser(
      "authenticated",
      owner,
      "select * from workout_sets",
    );
    expect(a.rows).toHaveLength(1);
    expect(a.rows[0].weight_kg).toBe("50");
    expect(a.rows[0].workout_id).toBe("workout-a");
  });
  it("denies another authenticated user across tables and normalized views", async () => {
    for (const table of [
      "workouts",
      "workout_sets",
      "exercise_appearances",
      "dashboard_entries",
      "sync_state",
      "sync_runs",
      "dashboard_owners",
    ]) {
      expect(
        (await asUser("authenticated", other, `select * from ${table}`)).rows,
      ).toHaveLength(0);
    }
    await expect(
      asUser(
        "authenticated",
        other,
        `insert into dashboard_entries(owner_id,kind,data) values('${owner}','annotation','{}')`,
      ),
    ).rejects.toThrow();
    await expect(
      asUser(
        "authenticated",
        other,
        `insert into dashboard_owners values('${other}')`,
      ),
    ).rejects.toThrow();
  });
  it("owner cannot mutate source or acquire service-only sync RPC", async () => {
    await expect(
      asUser("authenticated", owner, `delete from workouts`),
    ).rejects.toThrow();
    await expect(
      asUser(
        "authenticated",
        owner,
        `select acquire_sync('${owner}','${token}')`,
      ),
    ).rejects.toThrow();
  });
  it("owner dashboard CRUD is isolated from source", async () => {
    await asUser(
      "authenticated",
      owner,
      `insert into dashboard_entries(owner_id,kind,data) values('${owner}','annotation','{"name":"Context"}')`,
    );
    expect(
      (await asUser("authenticated", owner, "select * from dashboard_entries"))
        .rows,
    ).toHaveLength(1);
    expect((await db.query("select * from workouts")).rows).toHaveLength(1);
  });
  it("enforces overlap protection, cooldown and lease ownership", async () => {
    await expect(
      db.query("select acquire_sync($1,$2)", [owner, token]),
    ).rejects.toThrow("wait");
    await db.exec(
      `update sync_state set last_attempt=now()-interval '3 minutes';`,
    );
    await db.query("select acquire_sync($1,$2)", [owner, token]);
    await expect(
      db.query("select acquire_sync($1,$2)", [owner, token]),
    ).rejects.toThrow("running");
    await expect(
      db.query("select finish_sync($1,$2,$3::jsonb,true,now())", [
        owner,
        other,
        "[]",
      ]),
    ).rejects.toThrow("lease");
  });
  it("upserts updates idempotently and preserves previous data on partial failure", async () => {
    await commit(
      [{ id: "workout-a", payload: workout("workout-a", "Updated") }],
      false,
    );
    await db.exec(
      `update sync_state set last_attempt=now()-interval '3 minutes';`,
    );
    await db.query("select acquire_sync($1,$2)", [owner, token]);
    await commit(
      [{ id: "workout-a", payload: workout("workout-a", "Updated") }],
      false,
    );
    expect((await db.query("select * from workouts")).rows).toHaveLength(1);
    await db.exec(
      `update sync_state set last_attempt=now()-interval '3 minutes';`,
    );
    await db.query("select acquire_sync($1,$2)", [owner, token]);
    await expect(
      commit(
        [{ id: "broken", payload: { id: "broken", start_time: "bad-date" } }],
        true,
      ),
    ).rejects.toThrow();
    const rows = await db.query<any>("select payload from workouts");
    expect(rows.rows).toHaveLength(1);
    expect(rows.rows[0].payload.title).toBe("Updated");
  });
  it("handles deletion events without deleting dashboard annotations", async () => {
    await commit([{ id: "workout-a", payload: null }], false);
    expect((await db.query("select * from workouts")).rows).toHaveLength(0);
    expect(
      (await db.query("select * from dashboard_entries")).rows,
    ).toHaveLength(1);
  });
});
