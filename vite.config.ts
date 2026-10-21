import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, process.cwd(), "VITE_"), ...process.env };
  for (const name of Object.keys(env))
    if (
      /^VITE_.*(SECRET|SERVICE_ROLE|HEVY_API|PRIVATE)/i.test(name) &&
      env[name]
    )
      throw Error("Server-only credentials must not use VITE_ variables.");
  const key = env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (key?.startsWith("sb_secret_"))
    throw Error("A privileged Supabase key cannot be used in the frontend.");
  if (key?.split(".").length === 3) {
    let role = "";
    try {
      role = JSON.parse(
        Buffer.from(key.split(".")[1], "base64url").toString(),
      ).role;
    } catch {}
    if (role === "service_role")
      throw Error("The service-role key cannot be used in the frontend.");
  }
  return {
    plugins: [react()],
    base: env.VITE_BASE_PATH || "/hevy/",
    build: key
      ? {
          rollupOptions: {
            output: { manualChunks: { supabase: ["@supabase/supabase-js"] } },
          },
        }
      : undefined,
  };
});
