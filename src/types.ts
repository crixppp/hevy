export interface SetRecord {
  index: number;
  type: string;
  weight_kg: number | null;
  reps: number | null;
  rpe: number | null;
  distance_meters: number | null;
  duration_seconds: number | null;
  custom_metric?: number | null;
}
export interface Exercise {
  index: number;
  title: string;
  exercise_template_id: string;
  notes: string | null;
  superset_id: number | null;
  sets: SetRecord[];
}
export interface Workout {
  id: string;
  title: string;
  description: string | null;
  routine_id: string | null;
  start_time: string;
  end_time: string;
  created_at: string;
  updated_at: string;
  exercises: Exercise[];
}
export type MetaKind =
  | "block"
  | "annotation"
  | "goal"
  | "equipment"
  | "mapping"
  | "snapshot"
  | "settings";
export interface Entry {
  id: string;
  kind: MetaKind;
  data: Record<string, any>;
  updated_at?: string;
}
export interface Profile {
  id: string;
  exerciseId: string;
  name: string;
  start: string;
  end?: string;
  increment: number;
  mode: "external" | "bodyweight" | "assisted";
  reviewed: boolean;
  convention: string;
}
export interface Point {
  date: string;
  time: number;
  value: number;
  workoutId: string;
  profileId: string;
  sets: number;
  volume: number | null;
  rpe: number | null;
  order: number;
  load: number | null;
  reps: number | null;
}
export interface Forecast {
  eligible: boolean;
  reason: string;
  model: string;
  version: string;
  n: number;
  cutoff: string;
  targetDate: string;
  predicted?: number;
  baseline?: number;
  mae?: number;
  baselineMae?: number;
  low?: number;
  high?: number;
  fingerprint: string;
}
