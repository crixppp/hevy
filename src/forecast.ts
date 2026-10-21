import type { Point, Forecast, Workout } from "./types";
import { daysBetween, dayAdd, mean, dateKey, fingerprint } from "./analytics";
const median = (ns: number[]) => {
  const a = [...ns].sort((a, b) => a - b);
  return a.length
    ? (a[Math.floor((a.length - 1) / 2)] + a[Math.ceil((a.length - 1) / 2)]) / 2
    : 0;
};
function fit(ps: Point[]) {
  const x0 = ps[0].time;
  const x = ps.map((p) => (p.time - x0) / 86400000),
    y = ps.map((p) => p.value);
  const slopes = x.flatMap((a, i) =>
    x
      .slice(i + 1)
      .flatMap((b, j) => (b !== a ? [(y[i + j + 1] - y[i]) / (b - a)] : [])),
  );
  const slope = median(slopes),
    intercept = median(y.map((v, i) => v - slope * x[i]));
  return (t: number) => intercept + (slope * (t - x0)) / 86400000;
}
export function forecast(
  points: Point[],
  ws: Workout[],
  cutoff: string,
  horizon = 28,
): Forecast {
  const date = dateKey(cutoff);
  const ps = points.filter(
    (p) => p.time <= Date.parse(cutoff) && p.date >= dayAdd(date, -120),
  );
  const base = {
    eligible: false,
    reason: "At least 8 comparable sessions across 42 days are needed.",
    model: "none",
    version: "theil-sen-1",
    n: ps.length,
    cutoff,
    targetDate: dayAdd(date, horizon),
    fingerprint: fingerprint(ws, cutoff),
  };
  if (horizon < 7 || horizon > 42)
    return { ...base, reason: "Choose a horizon of 7–42 days." };
  if (ps.length < 8 || daysBetween(ps[0].date, ps.at(-1)!.date) < 42)
    return base;
  if (new Set(ps.map((p) => p.profileId)).size !== 1)
    return {
      ...base,
      reason:
        "Select one equipment profile; equipment changes split forecasts.",
    };
  if (daysBetween(ps.at(-1)!.date, date) > 28)
    return {
      ...base,
      reason: "Last comparable exposure was over 28 days ago.",
    };
  const train = ps.slice(0, -3),
    test = ps.slice(-3),
    predict = fit(train),
    last = train.at(-1)!.value;
  const mae = mean(test.map((p) => Math.abs(p.value - predict(p.time))))!,
    baselineMae = mean(test.map((p) => Math.abs(p.value - last)))!;
  const trend = mae < baselineMae;
  const predicted = trend
    ? Math.max(
        0,
        fit(ps)(
          ps.at(-1)!.time +
            daysBetween(ps.at(-1)!.date, base.targetDate) * 86400000,
        ),
      )
    : ps.at(-1)!.value;
  const err = trend ? mae : baselineMae;
  return {
    ...base,
    eligible: true,
    reason: trend
      ? "Robust trend beat the no-change baseline on 3 chronological holdouts."
      : "Trend did not beat the no-change baseline; showing the baseline.",
    model: trend ? "Theil–Sen trend" : "No-change baseline",
    predicted,
    baseline: ps.at(-1)!.value,
    mae,
    baselineMae,
    low: Math.max(0, predicted - 2 * err),
    high: predicted + 2 * err,
  };
}
export function evaluate(s: Forecast, points: Point[], ws: Workout[]) {
  if (fingerprint(ws, s.cutoff) !== s.fingerprint)
    return { status: "Source revised — create a new snapshot" };
  const p = points.find(
    (p) => p.date >= s.targetDate && p.date <= dayAdd(s.targetDate, 14),
  );
  if (!p) return { status: "Awaiting target observation" };
  return {
    status: "Evaluated against current source",
    observed: p.value,
    error: p.value - s.predicted!,
    baselineError: p.value - s.baseline!,
    workoutId: p.workoutId,
  };
}
