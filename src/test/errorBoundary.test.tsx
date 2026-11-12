import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { isChunkLoadError } from '@/lib/errorReport';
import { createQueryClient } from '@/lib/queryClient';

const report = vi.hoisted(() => vi.fn());
const reloadOnce = vi.hoisted(() => vi.fn());
vi.mock('@/lib/helpdesk', () => ({ reportFailureTicket: report }));
vi.mock('@/lib/errorReport', async (orig) => ({ ...(await orig<typeof import('@/lib/errorReport')>()), reloadOnceForChunkError: reloadOnce }));

function Boom({ msg }: { msg: string }): never { throw new Error(msg); }

describe('ErrorBoundary', () => {
  beforeEach(() => { report.mockClear(); reloadOnce.mockClear(); vi.spyOn(console, 'error').mockImplementation(() => {}); });

  it('mostra o fallback e abre chamado automático em erro de render', () => {
    render(<ErrorBoundary><Boom msg="quebrou" /></ErrorBoundary>);
    expect(screen.getByRole('alert')).toHaveTextContent('Algo deu errado nesta tela');
    expect(report).toHaveBeenCalledTimes(1);
    expect(report.mock.calls[0][1]).toBe('quebrou');
  });

  it('renderiza os filhos quando não há erro', () => {
    render(<ErrorBoundary><p>ok</p></ErrorBoundary>);
    expect(screen.getByText('ok')).toBeInTheDocument();
    expect(report).not.toHaveBeenCalled();
  });

  it('limpa o erro quando resetKey muda', () => {
    const { rerender } = render(<ErrorBoundary resetKey="/a"><Boom msg="x" /></ErrorBoundary>);
    expect(screen.getByRole('alert')).toBeInTheDocument();
    rerender(<ErrorBoundary resetKey="/b"><p>outra tela</p></ErrorBoundary>);
    expect(screen.getByText('outra tela')).toBeInTheDocument();
  });

  it('falha de chunk não abre chamado e pede recarga', () => {
    render(<ErrorBoundary><Boom msg="Failed to fetch dynamically imported module: /assets/X.js" /></ErrorBoundary>);
    expect(screen.getByRole('alert')).toHaveTextContent('Nova versão disponível');
    expect(report).not.toHaveBeenCalled();
    expect(reloadOnce).toHaveBeenCalledTimes(1);
  });
});

describe('errorReport', () => {
  it('reconhece falhas de chunk', () => {
    expect(isChunkLoadError(new Error('Failed to fetch dynamically imported module: x'))).toBe(true);
    expect(isChunkLoadError(new Error('Loading chunk 12 failed.'))).toBe(true);
    expect(isChunkLoadError(new Error("Cannot read properties of null"))).toBe(false);
  });
  it('recarrega só uma vez por sessão', async () => {
    const { reloadOnceForChunkError } = await vi.importActual<typeof import('@/lib/errorReport')>('@/lib/errorReport');
    const store: Record<string, string> = {};
    const storage = { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => { store[k] = v; } };
    const reload = vi.fn();
    expect(reloadOnceForChunkError(storage, reload)).toBe(true);
    expect(reloadOnceForChunkError(storage, reload)).toBe(false);
    expect(reload).toHaveBeenCalledTimes(1);
  });
});

describe('createQueryClient', () => {
  it('desliga refetch ao focar e define staleTime', () => {
    const o = createQueryClient().getDefaultOptions().queries!;
    expect(o.refetchOnWindowFocus).toBe(false);
    expect(o.staleTime).toBe(60_000);
    expect(o.retry).toBe(1);
  });
});
