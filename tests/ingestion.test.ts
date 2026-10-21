import { describe, it, expect, vi } from "vitest";
import {
  fetchChanges,
  syncAuthorized,
  validateWorkout,
} from "../supabase/functions/_shared/hevy";
const w = (id: string, updated = "2026-01-01T00:00:00Z") => ({
  id,
  title: "Synthetic test",
  start_time: "2026-01-01T00:00:00Z",
  updated_at: updated,
  exercises: [],
});
const json = (x: any, status = 200, headers = {}) =>
  new Response(JSON.stringify(x), { status, headers });
describe("read-only paginated Hevy adapter", () => {
  it("collects full pages and verifies count before returning a commit payload", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(json({ workout_count: 2 }))
      .mockResolvedValueOnce(
        json({ page: 1, page_count: 2, workouts: [w("a")] }),
      )
      .mockResolvedValueOnce(
        json({ page: 2, page_count: 2, workouts: [w("b")] }),
      )
      .mockResolvedValueOnce(json({ workout_count: 2 }));
    const c = await fetchChanges({
      key: "synthetic-key",
      since: null,
      fetcher,
    });
    expect(c.map((x) => x.id)).toEqual(["a", "b"]);
    for (const [url, options] of fetcher.mock.calls) {
      expect(url).toMatch(/^https:\/\/api.hevyapp.com\/v1\//);
      expect(options.method).toBe("GET");
      expect(options.redirect).toBe("error");
    }
  });
  it("keeps newest event once across updates and deletion duplicates", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(
      json({
        page: 1,
        page_count: 1,
        events: [
          { type: "deleted", id: "a" },
          { type: "updated", workout: w("a") },
          { type: "updated", workout: w("b", "2026-02-01T00:00:00Z") },
          { type: "updated", workout: w("b") },
        ],
      }),
    );
    const c = await fetchChanges({
      key: "fixture",
      since: "2026-01-01",
      fetcher,
    });
    expect(c).toHaveLength(2);
    expect(c[0].payload).toBeNull();
    expect(c[1].payload?.updated_at).toBe("2026-02-01T00:00:00Z");
  });
  it("retries rate limits and 5xx but never returns partial data", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(json({}, 429, { "Retry-After": "0" }))
      .mockResolvedValueOnce(
        json({
          page: 1,
          page_count: 2,
          events: [{ type: "updated", workout: w("a") }],
        }),
      )
      .mockResolvedValue(json({}, 500));
    await expect(
      fetchChanges({
        key: "fixture",
        since: "2026-01-01",
        fetcher,
        sleep: async () => {},
      }),
    ).rejects.toThrow("HTTP 500");
    expect(fetcher.mock.calls.length).toBe(6);
  });
  it("fails changed page counts and malformed data", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(json({ workout_count: 2 }))
      .mockResolvedValueOnce(
        json({ page: 1, page_count: 2, workouts: [w("a")] }),
      )
      .mockResolvedValueOnce(
        json({ page: 2, page_count: 3, workouts: [w("b")] }),
      );
    await expect(
      fetchChanges({ key: "fixture", since: null, fetcher }),
    ).rejects.toThrow("Source changed");
    expect(() => validateWorkout({ id: "a", exercises: [] })).toThrow();
  });
  it("fails duplicated full imports and count races; repeated successful runs are identical", async () => {
    const make = () =>
      vi
        .fn()
        .mockResolvedValueOnce(json({ workout_count: 1 }))
        .mockResolvedValueOnce(
          json({ page: 1, page_count: 1, workouts: [w("a")] }),
        )
        .mockResolvedValueOnce(json({ workout_count: 1 }));
    expect(
      await fetchChanges({ key: "f", since: null, fetcher: make() }),
    ).toEqual(await fetchChanges({ key: "f", since: null, fetcher: make() }));
    const bad = vi
      .fn()
      .mockResolvedValueOnce(json({ workout_count: 1 }))
      .mockResolvedValueOnce(
        json({ page: 1, page_count: 1, workouts: [w("a")] }),
      )
      .mockResolvedValueOnce(json({ workout_count: 2 }));
    await expect(
      fetchChanges({ key: "f", since: null, fetcher: bad }),
    ).rejects.toThrow("changed");
  });
  it("rejects anonymous and other users; scheduler needs separate long secret", () => {
    const secret = "x".repeat(40);
    expect(syncAuthorized(null, "owner", null, secret)).toBe(false);
    expect(syncAuthorized("other", "owner", null, secret)).toBe(false);
    expect(syncAuthorized("owner", "owner", null, secret)).toBe(true);
    expect(syncAuthorized(null, "owner", secret, secret)).toBe(true);
    expect(syncAuthorized(null, "owner", "short", "short")).toBe(false);
  });
});
