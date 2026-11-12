import { QueryClient } from '@tanstack/react-query';

/**
 * Padrões do cache de consultas. Hoje as telas buscam dados com hooks próprios (useState/useEffect);
 * estes valores valem para quem adotar useQuery: sem refetch ao focar a janela (evita recarregar
 * relatórios pesados ao alternar de aba), dados frescos por 1 min e no máximo 1 nova tentativa.
 */
export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { staleTime: 60_000, gcTime: 5 * 60_000, refetchOnWindowFocus: false, retry: 1 },
      mutations: { retry: 0 },
    },
  });
}
