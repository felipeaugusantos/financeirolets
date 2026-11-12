import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

const REQUIRED_ENV = ["VITE_SUPABASE_URL", "VITE_SUPABASE_PUBLISHABLE_KEY", "VITE_SUPABASE_PROJECT_ID"] as const;

// Validate after Cloud has injected its public values, without embedding a production fallback.
export function requireSupabaseEnv(): Plugin {
  return {
    name: "require-supabase-env",
    configResolved(config) {
      const missing = REQUIRED_ENV.filter((key) => {
        const defined = config.define?.[`import.meta.env.${key}`];
        // Vite's define values are JavaScript expressions (normally JSON strings).
        if (defined !== undefined) {
          try {
            const value: unknown = JSON.parse(String(defined));
            return typeof value !== "string" || !value.trim();
          } catch {
            return true;
          }
        }
        const value: unknown = config.env[key];
        return typeof value !== "string" || !value.trim();
      });
      if (missing.length) {
        throw new Error(
          `Variáveis ausentes: ${missing.join(", ")}. Copie .env.example para .env (local) ou cadastre-as no ambiente/CI.`,
        );
      }
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [requireSupabaseEnv(), react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
