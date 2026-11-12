/** Falha ao baixar um chunk lazy (deploy novo trocou os arquivos, rede caiu). Não é bug da tela. */
export function isChunkLoadError(error: unknown): boolean {
  const msg = error instanceof Error ? `${error.name} ${error.message}` : String(error ?? '');
  return /ChunkLoadError|Loading chunk .* failed|Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed/i.test(msg);
}

const RELOAD_KEY = 'lf-chunk-reload';

/** Recarrega uma única vez por sessão após falha de chunk; devolve false se já tentou. */
export function reloadOnceForChunkError(storage: Pick<Storage, 'getItem' | 'setItem'> = sessionStorage, reload: () => void = () => window.location.reload()): boolean {
  try {
    if (storage.getItem(RELOAD_KEY)) return false;
    storage.setItem(RELOAD_KEY, '1');
  } catch {
    return false;
  }
  reload();
  return true;
}
