import { it, expect } from "vitest";
import { parseLocalExport } from "../src/localImport";
import { demoWorkouts } from "../src/demo";
it("opens the existing export format without changing nullable source values", () => {
  const a = structuredClone(demoWorkouts.slice(0, 1));
  a[0].exercises[0].sets[0].weight_kg = 0;
  const result = parseLocalExport(
    JSON.stringify({ synced_at: "2026-10-21T00:00:00Z", workouts: a }),
  );
  expect(result.workouts).toEqual(a);
  expect(result.synced_at).toBe("2026-10-21T00:00:00Z");
});
it("rejects duplicate IDs and incorrect roots", () => {
  expect(() =>
    parseLocalExport(
      JSON.stringify({ workouts: [demoWorkouts[0], demoWorkouts[0]] }),
    ),
  ).toThrow("Duplicate");
  expect(() => parseLocalExport("[]")).toThrow("workouts array");
  expect(() => parseLocalExport("broken")).toThrow();
});
it("rejects invalid source schemas before an import can replace current records", () => {
  expect(() =>
    parseLocalExport(JSON.stringify({ workouts: [{ id: "invalid" }] })),
  ).toThrow("schema");
});
