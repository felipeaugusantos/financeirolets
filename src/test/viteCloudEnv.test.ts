// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { ResolvedConfig } from "vite";
import { requireSupabaseEnv } from "../../vite.config";

const values = {
  VITE_SUPABASE_URL: "https://example.invalid",
  VITE_SUPABASE_PUBLISHABLE_KEY: "public-test-key",
  VITE_SUPABASE_PROJECT_ID: "test-project",
};

function validate(env: Record<string, string>, define: Record<string, string> = {}, configFile?: string) {
  const hook = requireSupabaseEnv().configResolved;
  if (typeof hook !== "function") throw new Error("Missing resolved configuration validator");
  return hook.call({} as never, { env, define, configFile } as ResolvedConfig);
}

describe("Cloud build connection validation", () => {
  it("delegates connection configuration to the managed Cloud build", () => {
    expect(() => validate({}, {}, "/dev-server/.lovable/preview-supabase.config.ts")).not.toThrow();
  });

  it("still rejects missing values in ordinary development and production configs", () => {
    expect(() => validate({}, {}, "/dev-server/vite.config.ts")).toThrow("Variáveis ausentes");
    expect(() => validate({}, {}, "/dev-server/.lovable/vite.config.ts")).toThrow("Variáveis ausentes");
  });

  it("accepts values injected through define without a local env file", () => {
    const define = Object.fromEntries(Object.entries(values).map(([key, value]) => [
      `import.meta.env.${key}`, JSON.stringify(value),
    ]));
    expect(() => validate({}, define)).not.toThrow();
  });

  it("accepts resolved local environment values", () => {
    expect(() => validate(values)).not.toThrow();
  });

  it("rejects a missing connection instead of silently targeting production", () => {
    expect(() => validate({})).toThrow("Variáveis ausentes");
  });

  it("rejects an empty injected key even when a local key exists", () => {
    expect(() => validate(values, { "import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY": '""' }))
      .toThrow("VITE_SUPABASE_PUBLISHABLE_KEY");
  });
});