import { validateWorkout } from "../supabase/functions/_shared/hevy";
import type { Workout } from "./types";
export function parseLocalExport(text: string): {
  workouts: Workout[];
  synced_at: string | null;
} {
  if (text.length > 25 * 1024 * 1024)
    throw Error("Export exceeds the 25 MB limit.");
  const data = JSON.parse(text);
  if (!data || !Array.isArray(data.workouts))
    throw Error("Choose a Hevy JSON export containing a workouts array.");
  if (data.workouts.length > 20000)
    throw Error("This file exceeds the 20,000-workout import limit.");
  const workouts = data.workouts.map(validateWorkout) as unknown as Workout[];
  if (new Set(workouts.map((w) => w.id)).size !== workouts.length)
    throw Error(
      "Duplicate workout IDs found. Re-export the source before importing.",
    );
  return {
    workouts,
    synced_at:
      typeof data.synced_at === "string" &&
      Number.isFinite(Date.parse(data.synced_at))
        ? data.synced_at
        : null,
  };
}
