import type { Workout, Profile, Entry } from "./types";
// Deterministic synthetic fixture. Never derived from personal workout records.
export const DEMO_TODAY = "2026-10-21";
export const demoProfiles: Profile[] = [
  {
    id: "barbell-bench",
    exerciseId: "demo-bench",
    name: "Barbell · standard grip",
    start: "2026-01-01",
    increment: 2.5,
    mode: "external",
    reviewed: true,
    convention: "Total external load including bar; reps per set.",
  },
  {
    id: "barbell-squat",
    exerciseId: "demo-squat",
    name: "Barbell · full depth",
    start: "2026-01-01",
    increment: 2.5,
    mode: "external",
    reviewed: true,
    convention: "Total external load including bar; reps per set.",
  },
  {
    id: "cable-row",
    exerciseId: "demo-row",
    name: "Cable station A",
    start: "2026-01-01",
    increment: 2.5,
    mode: "external",
    reviewed: true,
    convention: "Recorded stack label; not equivalent to other machines.",
  },
];
export const demoWorkouts: Workout[] = Array.from({ length: 63 }, (_, i) => {
  const time = new Date(Date.UTC(2026, 5, 1 + i * 2.3, 7));
  const iso = time.toISOString();
  const lower = i % 3 === 1;
  const names = lower
    ? [
        ["demo-squat", "Squat (Barbell)", 75],
        ["demo-rdl", "Romanian Deadlift", 60],
        ["demo-calf", "Calf Raise", 40],
      ]
    : [
        ["demo-bench", "Bench Press (Barbell)", 50],
        ["demo-row", "Seated Cable Row", 40],
        ["demo-press", "Shoulder Press (Dumbbell)", 17.5],
      ];
  return {
    id: `synthetic-${i}`,
    title: lower ? "Lower body · strength" : "Upper body · strength",
    description: "Synthetic example session.",
    routine_id: null,
    start_time: iso,
    end_time: new Date(+time + (48 + (i % 9)) * 60000).toISOString(),
    created_at: iso,
    updated_at: iso,
    exercises: names.map(([id, title, base], j) => ({
      index: j,
      title: String(title),
      exercise_template_id: String(id),
      notes: j === 0 ? "Consistent technique in this synthetic example." : null,
      superset_id: null,
      sets: Array.from({ length: 4 }, (_, k) => ({
        index: k,
        type: k === 0 ? "warmup" : "normal",
        weight_kg:
          k === 0
            ? 20
            : Number(base) + Math.floor(i / 12) * 2.5 + (i % 7 === 0 ? 2.5 : 0),
        reps: k === 0 ? 10 : 6 + ((i + k) % 3),
        rpe: k === 0 || i % 4 === 0 ? null : 7 + (k % 2) * 0.5,
        distance_meters: null,
        duration_seconds: null,
      })),
    })),
  };
});
export const demoEntries: Entry[] = [
  {
    id: "demo-settings",
    kind: "settings",
    data: { priorityIds: ["demo-bench", "demo-squat", "demo-row"] },
  },
  ...demoProfiles.map((p) => ({
    id: p.id,
    kind: "equipment" as const,
    data: p,
  })),
  {
    id: "demo-block-1",
    kind: "block",
    data: {
      name: "Foundation",
      start: "2026-06-01",
      end: "2026-07-31",
      notes: "Synthetic training block.",
    },
  },
  {
    id: "demo-block-2",
    kind: "block",
    data: {
      name: "Build",
      start: "2026-08-01",
      end: "2026-10-21",
      notes: "Synthetic training block.",
    },
  },
  {
    id: "demo-note",
    kind: "annotation",
    data: {
      name: "Technique checkpoint",
      start: "2026-09-01",
      end: "2026-09-01",
      notes:
        "Paused bench reps from this point. Example context, not a causal explanation.",
      exerciseId: "demo-bench",
    },
  },
  {
    id: "demo-goal",
    kind: "goal",
    data: {
      name: "Bench · 80 kg estimated 1RM",
      exerciseId: "demo-bench",
      profileId: "barbell-bench",
      metric: "e1rm",
      target: 80,
      start: "2026-06-01",
      deadline: "2026-12-01",
    },
  },
];
