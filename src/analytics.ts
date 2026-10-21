import type { Workout, SetRecord, Profile, Point } from "./types";
export const VERSION = "metrics-1";
export const dateKey = (time: string | number | Date) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Australia/Melbourne",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(time));
export const dayAdd = (d: string, n: number) =>
  new Date(Date.parse(d + "T12:00:00Z") + n * 86400000)
    .toISOString()
    .slice(0, 10);
export function weekKey(d: string) {
  const day = new Date(d + "T12:00:00Z").getUTCDay();
  return dayAdd(d, -((day + 6) % 7));
}
export const daysBetween = (a: string, b: string) =>
  Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
export const valid = (n: unknown): n is number =>
  typeof n === "number" && Number.isFinite(n) && n >= 0;
export const validReps = (n: unknown): n is number =>
  valid(n) && Number.isInteger(n);
export const working = (s: SetRecord) =>
  ["normal", "failure", "dropset"].includes(s.type);
export const setVolume = (s: SetRecord) =>
  working(s) && valid(s.weight_kg) && validReps(s.reps)
    ? s.weight_kg * s.reps
    : null;
export function e1rm(s: SetRecord) {
  return working(s) &&
    valid(s.weight_kg) &&
    s.weight_kg > 0 &&
    validReps(s.reps) &&
    s.reps >= 1 &&
    s.reps <= 10
    ? s.weight_kg * (s.reps === 1 ? 1 : 1 + s.reps / 30)
    : null;
}
export const sumKnown = (ns: (number | null)[]) =>
  ns.some((n) => n !== null)
    ? ns.reduce<number>((a, n) => a + (n ?? 0), 0)
    : null;
export const mean = (ns: number[]) =>
  ns.length ? ns.reduce((a, b) => a + b, 0) / ns.length : null;
export const percent = (a: number, b: number) =>
  b === 0 ? null : ((a - b) / b) * 100;
export const kgToLb = (n: number) => n / 0.45359237;
export function duration(w: Workout) {
  const n = (Date.parse(w.end_time) - Date.parse(w.start_time)) / 60000;
  return Number.isFinite(n) && n >= 0 ? n : null;
}
export const inRange = (w: Workout, start: string, end: string) => {
  const d = dateKey(w.start_time);
  return d >= start && d <= end;
};
export function summary(ws: Workout[], start: string, end: string) {
  const w = ws.filter((x) => inRange(x, start, end));
  const sets = w.flatMap((x) => x.exercises.flatMap((e) => e.sets));
  const work = sets.filter(working);
  const rpe = work.filter((s) => valid(s.rpe) && s.rpe <= 10);
  return {
    sessions: w.length,
    days: new Set(w.map((x) => dateKey(x.start_time))).size,
    working: work.length,
    warmups: sets.filter((x) => x.type === "warmup").length,
    volume: sumKnown(work.map(setVolume)),
    rpe: mean(rpe.map((x) => x.rpe!)),
    rpeCoverage: work.length ? rpe.length / work.length : null,
    duration: mean(w.map(duration).filter((n): n is number => n !== null)),
    frequency: (w.length * 7) / Math.max(1, daysBetween(start, end) + 1),
    workouts: w,
  };
}
export function weeks(ws: Workout[], start: string, end: string) {
  const result = [];
  for (let d = weekKey(start); d <= end; d = dayAdd(d, 7)) {
    const s = summary(
      ws,
      d < start ? start : d,
      dayAdd(d, 6) > end ? end : dayAdd(d, 6),
    );
    result.push({
      date: d,
      label: d.slice(5),
      sessions: s.sessions,
      sets: s.working,
      volume: s.volume,
      minutes: s.duration,
      partial: d < start || dayAdd(d, 6) > end,
    });
  }
  return result;
}
export function profileAt(
  profiles: Profile[],
  exerciseId: string,
  date: string,
) {
  return profiles
    .filter(
      (p) =>
        p.exerciseId === exerciseId &&
        p.start <= date &&
        (!p.end || p.end >= date),
    )
    .sort((a, b) => b.start.localeCompare(a.start))[0];
}
export function exerciseSeries(
  ws: Workout[],
  id: string,
  profiles: Profile[],
): Point[] {
  return ws
    .flatMap((w) => {
      const date = dateKey(w.start_time),
        p = profileAt(profiles, id, date);
      if (!p?.reviewed || p.mode !== "external") return [];
      const es = w.exercises.filter((e) => e.exercise_template_id === id);
      if (!es.length) return [];
      const eligible = es
        .flatMap((e) => e.sets.map((s) => ({ s, v: e1rm(s) })))
        .filter((x): x is { s: SetRecord; v: number } => x.v !== null);
      if (!eligible.length) return [];
      const best = eligible.reduce((a, b) => (a.v > b.v ? a : b));
      const work = es.flatMap((e) => e.sets).filter(working);
      return [
        {
          date,
          time: Date.parse(w.start_time),
          value: best.v,
          workoutId: w.id,
          profileId: p.id,
          sets: work.length,
          volume: sumKnown(work.map(setVolume)),
          rpe: mean(
            work.filter((s) => valid(s.rpe) && s.rpe <= 10).map((s) => s.rpe!),
          ),
          order: es[0].index + 1,
          load: best.s.weight_kg,
          reps: best.s.reps,
        },
      ];
    })
    .sort((a, b) => a.time - b.time);
}
export function exerciseList(ws: Workout[]) {
  const m = new Map<
    string,
    { id: string; name: string; sessions: number; sets: number; last: string }
  >();
  for (const w of ws)
    for (const e of w.exercises) {
      const d = dateKey(w.start_time),
        a = m.get(e.exercise_template_id) ?? {
          id: e.exercise_template_id,
          name: e.title,
          sessions: 0,
          sets: 0,
          last: d,
        };
      a.sessions++;
      a.sets += e.sets.filter(working).length;
      if (d > a.last) a.last = d;
      m.set(a.id, a);
    }
  return [...m.values()].sort((a, b) => b.sessions - a.sessions);
}
export function quality(ws: Workout[]) {
  const sets = ws.flatMap((w) => w.exercises.flatMap((e) => e.sets));
  return {
    sets: sets.length,
    missingWeight: sets.filter((s) => s.weight_kg == null).length,
    missingReps: sets.filter((s) => s.reps == null).length,
    invalid: sets.filter(
      (s) =>
        !["normal", "failure", "dropset", "warmup"].includes(s.type) ||
        (s.weight_kg !== null && !valid(s.weight_kg)) ||
        (s.reps !== null && !validReps(s.reps)) ||
        (s.rpe !== null && (!valid(s.rpe) || s.rpe > 10)),
    ).length,
  };
}
export function fingerprint(ws: Workout[], cutoff: string) {
  let h = 2166136261;
  for (const c of JSON.stringify(
    ws
      .filter((w) => Date.parse(w.start_time) <= Date.parse(cutoff))
      .sort((a, b) => a.id.localeCompare(b.id)),
  )) {
    h ^= c.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16);
}
