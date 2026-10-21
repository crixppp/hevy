import { it, expect } from "vitest";
import { acceptBridgeMessage, BRIDGE_ORIGIN } from "../src/macBridge";
import { demoWorkouts } from "../src/demo";
const popup = {} as Window,
  state = "a".repeat(64),
  data = {
    type: "training-lens:snapshot",
    state,
    payload: { synced_at: "2026-10-21T00:00:00Z", workouts: demoWorkouts },
  };
it("accepts only the expected local window, origin and nonce", () => {
  expect(
    acceptBridgeMessage(
      { origin: BRIDGE_ORIGIN, source: popup, data },
      popup,
      state,
    )?.workouts.length,
  ).toBe(63);
  expect(
    acceptBridgeMessage(
      { origin: "https://evil.example", source: popup, data },
      popup,
      state,
    ),
  ).toBeNull();
  expect(
    acceptBridgeMessage(
      { origin: BRIDGE_ORIGIN, source: {} as Window, data },
      popup,
      state,
    ),
  ).toBeNull();
  expect(
    acceptBridgeMessage(
      {
        origin: BRIDGE_ORIGIN,
        source: popup,
        data: { ...data, state: "wrong" },
      },
      popup,
      state,
    ),
  ).toBeNull();
});
it("rejects malformed snapshots without replacing the current dataset", () => {
  expect(() =>
    acceptBridgeMessage(
      {
        origin: BRIDGE_ORIGIN,
        source: popup,
        data: { ...data, payload: { workouts: [{ id: "bad" }] } },
      },
      popup,
      state,
    ),
  ).toThrow("schema");
});
