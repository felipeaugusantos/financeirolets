import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

const REQUIRED_ENV = ["VITE_SUPABASE_URL", "VITE_SUPABASE_PUBLISHABLE_KEY", "VITE_SUPABASE_PROJECT_ID"] as const;

// Sem valor padrão embutido: um build sem variáveis falha em vez de apontar em silêncio para produção.
function requireSupabaseEnv(mode: string): Plugin {
  return {
    name: "require-supabase-env",
    config() {
      const env = loadEnv(mode, process.cwd(), "VITE_");
      const missing = REQUIRED_ENV.filter((k) => !env[k]);
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
  plugins: [requireSupabaseEnv(mode), react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
