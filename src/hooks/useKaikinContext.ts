import { useEffect } from 'react';
import { useKaikin, KaikinPageContext } from '@/components/kaikin/KaikinProvider';

/**
 * Injeta um contexto de página no Kaikin enquanto o componente estiver montado.
 * Limpa automaticamente no unmount.
 */
export function useKaikinContext(ctx: KaikinPageContext | null) {
  const { setPageContext } = useKaikin();
  useEffect(() => {
    setPageContext(ctx);
    return () => setPageContext(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(ctx)]);
}
