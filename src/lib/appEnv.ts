/**
 * Identificação do ambiente (produção × homologação).
 *
 * O clone de homologação é um projeto separado, com backend próprio. Como cada
 * projeto tem seu próprio `VITE_SUPABASE_PROJECT_ID`, basta comparar com o id
 * do backend de produção: qualquer backend diferente é homologação.
 */

/** Backend de produção do cliente (Let's Finance). */
export const PRODUCTION_PROJECT_ID = 'iulpdewkhzxvyemhlnej';

/** Domínios considerados produção. */
const PRODUCTION_HOSTS = ['financeirolets.lovable.app'];

export type AppEnv = 'producao' | 'homologacao';

export function detectEnv(
  projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID as string | undefined,
  host = typeof window !== 'undefined' ? window.location.hostname : ''
): AppEnv {
  // Backend diferente do de produção ⇒ é o clone de homologação.
  if (projectId && projectId !== PRODUCTION_PROJECT_ID) return 'homologacao';
  // Mesmo backend, mas fora do domínio publicado (preview) ⇒ tratar como produção
  // para não dar falsa sensação de segurança: os dados são os reais.
  if (PRODUCTION_HOSTS.includes(host)) return 'producao';
  return 'producao';
}

export const APP_ENV: AppEnv = detectEnv();
export const IS_HOMOLOG = APP_ENV === 'homologacao';

/** Versão exibida no rodapé/faixa — atualizada a cada validação publicada. */
export const APP_VERSION = '1.2.5';
