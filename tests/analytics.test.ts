import { describe, it, expect } from "vitest";
import {
  setVolume,
  e1rm,
  summary,
  dateKey,
  weekKey,
  kgToLb,
  percent,
  exerciseSeries,
  duration,
  profileAt,
} from "../src/analytics";
import { forecast, evaluate } from "../src/forecast";
import { demoWorkouts, demoProfiles } from "../src/demo";
import type { Workout, SetRecord, Point } from "../src/types";
const set = (data: Partial<SetRecord> = {}): SetRecord => ({
  index: 0,
  type: "normal",
  weight_kg: 50,
  reps: 6,
  rpe: null,
  distance_meters: null,
  duration_seconds: null,
  ...data,
});
const w: Workout = {
  id: "fixture",
  title: "Independent hand calculation",
  description: null,
  routine_id: null,
  start_time: "2026-10-03T14:30:00Z",
  end_time: "2026-10-03T15:15:00Z",
  created_at: "2026-10-03T14:30:00Z",
  updated_at: "2026-10-03T15:15:00Z",
  exercises: [
    {
      index: 0,
      title: "Bench",
      exercise_template_id: "bench",
      notes: null,
      superset_id: null,
      sets: [
        set({ type: "warmup", weight_kg: 20, reps: 10 }),
        set(),
        set({ index: 1, weight_kg: 0, reps: 8 }),
        set({ index: 2, weight_kg: null, reps: 8 }),
        set({ index: 3, type: "dropset", weight_kg: 30, reps: 10 }),
        set({ index: 4, type: "unknown", weight_kg: 80, reps: 1 }),
      ],
    },
  ],
};
describe("hand-calculated metric contract", () => {
  it("preserves zero vs missing and excludes warmups and unknown types", () => {
    expect(setVolume(set({ weight_kg: 0 }))).toBe(0);
    expect(setVolume(set({ weight_kg: null }))).toBeNull();
    expect(setVolume(set({ type: "warmup" }))).toBeNull();
    const s = summary([w], "2026-10-04", "2026-10-04");
    expect(s.sessions).toBe(1);
    expect(s.working).toBe(4);
    expect(s.warmups).toBe(1);
    expect(s.volume).toBe(600);
    expect(s.rpeCoverage).toBe(0);
    expect(s.rpe).toBeNull();
  });
  it("Epley is 60 kg for 50×6, 50 for 50×1; never RPE-adjusted", () => {
    expect(e1rm(set())).toBe(60);
    expect(e1rm(set({ reps: 1 }))).toBe(50);
    expect(e1rm(set({ reps: 11 }))).toBeNull();
    expect(e1rm(set({ weight_kg: 0 }))).toBeNull();
    expect(e1rm(set({ rpe: 10 }))).toBe(60);
  });
  it("handles invalid numbers and zero baselines", () => {
    expect(setVolume(set({ reps: 2.2 }))).toBeNull();
    expect(e1rm(set({ weight_kg: -1 }))).toBeNull();
    expect(percent(10, 0)).toBeNull();
    expect(kgToLb(0.45359237)).toBeCloseTo(1, 10);
    expect(duration(w)).toBe(45);
    expect(duration({ ...w, end_time: "2020-01-01" })).toBeNull();
  });
  it("uses Melbourne DST dates and local Monday weeks", () => {
    expect(dateKey("2026-10-03T14:30:00Z")).toBe("2026-10-04");
    expect(dateKey("2026-10-03T15:30:00Z")).toBe("2026-10-04");
    expect(dateKey("2026-04-04T15:30:00Z")).toBe("2026-04-05");
    expect(dateKey("2026-04-04T16:30:00Z")).toBe("2026-04-05");
    expect(weekKey("2026-10-04")).toBe("2026-09-28");
    expect(weekKey("2026-10-05")).toBe("2026-10-05");
  });
  it("normalizes frequency by inclusive dates", () => {
    expect(summary([w], "2026-10-04", "2026-10-10").frequency).toBe(1);
    expect(summary([w], "2026-10-04", "2026-10-17").frequency).toBe(0.5);
  });
  it("requires reviewed compatible equipment and does not double load", () => {
    const p = {
      id: "p",
      exerciseId: "bench",
      name: "One machine",
      start: "2020-01-01",
      increment: 2.5,
      mode: "external" as const,
      reviewed: true,
      convention: "recorded load",
    };
    expect(exerciseSeries([w], "bench", [])).toEqual([]);
    expect(exerciseSeries([w], "bench", [p])[0].value).toBe(60);
    expect(exerciseSeries([w], "bench", [{ ...p, mode: "assisted" }])).toEqual(
      [],
    );
    expect(
      profileAt(
        [p, { ...p, id: "new", start: "2026-10-01" }],
        "bench",
        "2026-10-04",
      )?.id,
    ).toBe("new");
  });
});
const points: Point[] = Array.from({ length: 12 }, (_, i) => ({
  date: `2026-${i < 6 ? "08" : "09"}-${String(1 + (i % 6) * 5).padStart(2, "0")}`,
  time: Date.UTC(2026, 7, 1 + i * 5),
  value: 60 + i,
  workoutId: `w${i}`,
  profileId: "p",
  sets: 3,
  volume: 900,
  rpe: 8,
  order: 1,
  load: 50,
  reps: 6,
})).map((p) => ({ ...p, date: new Date(p.time).toISOString().slice(0, 10) }));
describe("forecast eligibility, holdout and fixed evaluation", () => {
  it("rejects sparse histories and equipment changes", () => {
    expect(forecast(points.slice(0, 4), [], "2026-10-01", 28).eligible).toBe(
      false,
    );
    expect(
      forecast(
        points.map((p, i) => ({ ...p, profileId: i === 0 ? "q" : "p" })),
        [],
        "2026-10-01",
        28,
      ).eligible,
    ).toBe(false);
    expect(forecast(points, [], "2026-10-01", 90).eligible).toBe(false);
  });
  it("does not use future points", () => {
    const a = forecast(points, [], "2026-10-01", 28),
      b = forecast(
        [
          ...points,
          {
            ...points[0],
            date: "2027-01-01",
            time: Date.UTC(2027, 0, 1),
            value: 10000,
          },
        ],
        [],
        "2026-10-01",
        28,
      );
    expect(a).toEqual(b);
    expect(a.eligible).toBe(true);
    expect(a.mae).toBeCloseTo(0);
  });
  it("selects baseline on flat data", () => {
    const f = forecast(
      points.map((p) => ({ ...p, value: 60 })),
      [],
      "2026-10-01",
      28,
    );
    expect(f.model).toBe("No-change baseline");
    expect(f.predicted).toBe(60);
  });
  it("retains declining trends without promising progress", () => {
    const f = forecast(
      points.map((p, i) => ({ ...p, value: 80 - i })),
      [],
      "2026-10-01",
      28,
    );
    expect(f.predicted).toBeLessThan(69);
  });
  it("evaluates only first target-window observation; revised history invalidates", () => {
    const f = forecast(points, [w], "2026-10-05T00:00:00Z", 7);
    const target = {
      ...points.at(-1)!,
      date: f.targetDate,
      time: Date.parse(f.targetDate),
      value: 70,
    };
    expect(evaluate(f, [target], [w]).observed).toBe(70);
    expect(evaluate(f, [target], [{ ...w, title: "edited" }]).status).toContain(
      "revised",
    );
    expect(
      evaluate(f, [{ ...target, date: "2027-01-01" }], [w]).error,
    ).toBeUndefined();
  });
  it("works against deterministic synthetic data", () => {
    expect(demoWorkouts.length).toBe(63);
    const s = exerciseSeries(demoWorkouts, "demo-bench", demoProfiles);
    expect(s.length).toBeGreaterThan(8);
    expect(forecast(s, demoWorkouts, "2026-10-21T12:59:59Z", 28).eligible).toBe(
      true,
    );
  });
});
