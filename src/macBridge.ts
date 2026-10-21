import { parseLocalExport } from "./localImport";
import type { Workout, Entry } from "./types";
export const BRIDGE_ORIGIN = "http://127.0.0.1:8765";
export interface MacCache {
  workouts: Workout[];
  entries: Entry[];
  synced_at: string | null;
  received_at: string;
  version: 1;
  last_attempt?: string | null;
  sync_error?: string | null;
}
export function acceptBridgeMessage(
  event: Pick<MessageEvent, "origin" | "source" | "data">,
  popup: Window | null,
  state: string,
) {
  if (
    event.origin !== BRIDGE_ORIGIN ||
    !popup ||
    event.source !== popup ||
    event.data?.type !== "training-lens:snapshot" ||
    event.data?.state !== state
  )
    return null;
  const imported = parseLocalExport(JSON.stringify(event.data.payload));
  const status = event.data.payload?.bridge_status;
  return {
    ...imported,
    last_attempt:
      typeof status?.last_attempt === "number" &&
      Number.isFinite(status.last_attempt)
        ? new Date(status.last_attempt * 1000).toISOString()
        : null,
    sync_error:
      typeof status?.error === "string" ? status.error.slice(0, 250) : null,
  };
}
export function connectMac(): Promise<{
  workouts: Workout[];
  synced_at: string | null;
  last_attempt: string | null;
  sync_error: string | null;
}> {
  const state = Array.from(crypto.getRandomValues(new Uint8Array(32)), (n) =>
    n.toString(16).padStart(2, "0"),
  ).join("");
  const popup = window.open(
    `${BRIDGE_ORIGIN}/connect?origin=${encodeURIComponent(location.origin)}&state=${state}`,
    "training-lens-mac",
    "width=640,height=580",
  );
  if (!popup)
    return Promise.reject(
      Error("Allow this connection window to open, then try again."),
    );
  return new Promise((resolve, reject) => {
    let timer: ReturnType<typeof setInterval>;
    let done = false;
    const cleanup = () => {
      done = true;
      clearInterval(timer);
      window.removeEventListener("message", receive);
    };
    const receive = (event: MessageEvent) => {
      try {
        const imported = acceptBridgeMessage(event, popup, state);
        if (!imported) return;
        cleanup();
        resolve(imported);
      } catch {
        cleanup();
        reject(
          Error(
            "The Mac snapshot was invalid. Your previous data was preserved.",
          ),
        );
      }
    };
    window.addEventListener("message", receive);
    const started = Date.now();
    timer = setInterval(() => {
      if (done) return;
      if (popup.closed || Date.now() - started > 360000) {
        cleanup();
        reject(
          Error(
            "Mac connection closed or timed out. Start the Mac helper and try again; your last snapshot is still available.",
          ),
        );
      }
    }, 1000);
  });
}
function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open("training-lens-mac", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("snapshot");
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(Error("Browser storage is unavailable."));
  });
}
export async function readMacCache(): Promise<MacCache | null> {
  const db = await database();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction("snapshot", "readonly"),
        r = tx.objectStore("snapshot").get("latest");
      r.onsuccess = () => resolve(r.result ?? null);
      r.onerror = () => reject(r.error);
    });
  } finally {
    db.close();
  }
}
let cacheWrites: Promise<unknown> = Promise.resolve();
async function saveCache(value: MacCache) {
  const db = await database();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("snapshot", "readwrite");
      tx.objectStore("snapshot").put(value, "latest");
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}
async function deleteCache() {
  const db = await database();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("snapshot", "readwrite");
      tx.objectStore("snapshot").delete("latest");
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

export function writeMacCache(value: MacCache) {
  cacheWrites = cacheWrites.catch(() => {}).then(() => saveCache(value));
  return cacheWrites;
}
export function clearMacCache() {
  cacheWrites = cacheWrites.catch(() => {}).then(() => deleteCache());
  return cacheWrites;
}
