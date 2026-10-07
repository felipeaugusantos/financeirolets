import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

import AutoPostDialog from '@/components/ofx/AutoPostDialog';
import type { EnrichedEntry } from '@/hooks/useOfxImport';

let root: Root | null = null;
const text = () => document.body.textContent ?? '';

const line = (id: string, memo: string): EnrichedEntry => ({
  entry: { id, posted_at: '2026-09-03', amount: -10, memo },
  ruleLabel: 'stone', ruleCategoryId: 'c1', ruleUnitId: 'u1', ruleFrontId: null, ruleAllocations: null,
}) as unknown as EnrichedEntry;

const options = {
  categories: [{ id: 'c1', name: 'Vendas' }], units: [{ id: 'u1', name: 'Boulevard' }], fronts: [], partners: [],
} as never;

async function click(name: RegExp) {
  const btn = Array.from(document.querySelectorAll('button')).find(b => name.test(b.textContent ?? ''));
  if (!btn) throw new Error(`botão não encontrado: ${name}`);
  await act(async () => { btn.click(); });
}

beforeEach(() => { root?.unmount(); root = null; document.body.innerHTML = ''; });

describe('Lançar linhas do extrato: marcar e desmarcar todas', () => {
  it('Marcar todas seleciona tudo menos as duplicidades; Desmarcar todas limpa', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    const items = [line('a', 'RENTAB 1'), line('b', 'PIX FORNECEDOR'), line('c', 'PIX REPETIDO')];
    await act(async () => {
      root!.render(
        <AutoPostDialog open onOpenChange={() => {}} items={items} duplicateIds={new Set(['c'])}
          options={options} onConfirm={vi.fn()} />,
      );
    });
    await click(/Desmarcar todas|Marcar todas/); // parte de qualquer estado inicial
    await click(/^Marcar todas/);
    expect(text()).toContain('2 de 3 linha(s)');
    expect(text()).toContain('Lançar 2 linha(s)');
    expect(text()).toContain('exceto 1 duplicidade(s)');

    await click(/Desmarcar todas/);
    expect(text()).toContain('0 de 3 linha(s)');
    expect(text()).toContain('Lançar 0 linha(s)');
    const launch = Array.from(document.querySelectorAll('button')).find(b => /Lançar 0 linha/.test(b.textContent ?? ''));
    expect(launch?.hasAttribute('disabled')).toBe(true);
  });
});
