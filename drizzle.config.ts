import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./drizzle/schema.ts",
  // Legacy migrations mirror schema already applied by the original workflow.
  // Keep that history intact; new Cloud migrations must not replay it.
  out: "./drizzle/cloud-migrations",
});
