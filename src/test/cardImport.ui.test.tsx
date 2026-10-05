import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import * as XLSX from 'xlsx';

// Sem @testing-library/dom (peer não instalado): helpers mínimos sobre o React + jsdom.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let host: HTMLDivElement | null = null;

const bodyText = () => document.body.textContent ?? '';
const has = (re: RegExp | string) => (typeof re === 'string' ? bodyText().includes(re) : re.test(bodyText()));

async function waitFor(check: () => void, timeoutMs = 3000) {
  const start = Date.now();
  for (;;) {
    try { check(); return; } catch (e) {
      if (Date.now() - start > timeoutMs) throw e;
      await act(async () => { await new Promise(r => setTimeout(r, 15)); });
    }
  }
}

async function mount(ui: React.ReactElement) {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => { root!.render(ui); });
  return host;
}

async function chooseFile(container: HTMLElement, file: File) {
  const input = container.querySelector('input[type="file"]') as HTMLInputElement;
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  await act(async () => { input.dispatchEvent(new Event('change', { bubbles: true })); });
}

async function clickButton(name: RegExp | string) {
  const btn = Array.from(document.querySelectorAll('button')).find(b =>
    typeof name === 'string' ? b.textContent?.trim() === name : name.test(b.textContent ?? ''));
  if (!btn) throw new Error(`botão não encontrado: ${String(name)}`);
  await act(async () => { btn.click(); });
}

// --- Supabase falso: devolve cadastros fixos e registra o que o app tenta gravar ---------------------
const upserts: { rows: Record<string, unknown>[]; options: unknown }[] = [];

vi.mock('@/integrations/supabase/client', () => {
  const lists: Record<string, unknown[]> = {
    accounts: [{ id: 'acc1', name: 'Bradesco Café' }],
    units: [{ id: 'u-fab', name: 'Fábrica' }, { id: 'u-bou', name: "Let's Boulevard" }],
    business_fronts: [],
    categories: [
      { id: 'c-mp', name: 'Matéria-Prima', type: 'despesa' },
      { id: 'c-rec', name: 'Matéria-Prima', type: 'receita' },
    ],
  };
  const chain = (data: unknown[]) => {
    const q: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'order', 'limit']) q[m] = () => q;
    q.then = (resolve: (v: unknown) => void) => resolve({ data, error: null });
    return q;
  };
  return {
    supabase: {
      from: (table: string) => {
        if (table === 'card_statement_entries') {
          return {
            ...chain([]),
            upsert: (rows: Record<string, unknown>[], options: unknown) => {
              upserts.push({ rows, options });
              return { select: () => Promise.resolve({ data: rows.map((_, i) => ({ id: `n${i}` })), error: null }) };
            },
          };
        }
        return chain(lists[table] ?? []);
      },
      rpc: vi.fn(),
    },
  };
});
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'user-1' } }) }));

import CardReconciliation from '@/pages/CardReconciliation';
import { Toaster } from '@/components/ui/toaster';

const Page = () => <><CardReconciliation /><Toaster /></>;

/** Planilha no layout do cliente: títulos, 2 cartões lado a lado, categoria/unidade sem cabeçalho, linha repetida. */
function workbookFile(): File {
  const aoa = [
    ['CARTÃO VISA INFINITY - VENC. 09/09', '', '', '', '', '', 'CARTÃO MASTERCARD BLACK - VENC. 09/09', '', '', '', ''],
    ['TITULAR', '', '', '', '', '', 'TITULAR', '', '', '', ''],
    ['DATA', 'LANÇAMENTO', 'VALOR', '', '', '', 'DATA', 'LANÇAMENTO', 'VALOR', '', ''],
    ['04/03/2026', 'Loja Santo A', 60.84, 'Materia Prima', 'Fabrica', '', '04/03/2026', 'Loja Santo A', 60.84, 'Materia Prima', 'Boulevard'],
    ['05/03/2026', 'Pedágio', 9.12, 'Materia Prima', 'Fabrica', '', '05/03/2026', 'Estorno loja', -20, '', ''],
    ['05/03/2026', 'Pedágio', 9.12, 'Materia Prima', 'Fabrica', '', '', '', '', '', ''],
    ['', 'TOTAL', 79.08, '', '', '', '', '', '', '', ''],
  ];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Planilha1');
  const bytes = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
  const file = new File([bytes], 'fatura.xlsx');
  // o jsdom não implementa Blob.arrayBuffer
  Object.defineProperty(file, 'arrayBuffer', { value: () => Promise.resolve(bytes) });
  return file;
}

// O Radix atualiza estado fora do act em animações; é ruído, não falha.
beforeAll(() => {
  const original = console.error;
  console.error = (...args: unknown[]) => {
    if (String(args[0]).includes('not wrapped in act')) return;
    original(...args);
  };
});

beforeEach(() => {
  upserts.length = 0;
  root?.unmount();
  host?.remove();
  root = null;
  host = null;
  document.body.innerHTML = '';
});

describe('importação da planilha de cartão (tela)', () => {
  it('mostra a conferência, só grava depois de confirmar, mantém linhas repetidas e preenche unidade/categoria', async () => {
    const container = await mount(<Page />);
    await waitFor(() => expect(has('Importar planilha')).toBe(true));

    await chooseFile(container, workbookFile());

    // conferência antes de gravar
    await waitFor(() => expect(has('Conferir antes de importar')).toBe(true));
    expect(upserts).toHaveLength(0);
    expect(has(/CARTÃO VISA INFINITY/)).toBe(true);
    expect(has(/CARTÃO MASTERCARD BLACK/)).toBe(true);
    expect(has(/A soma confere com o total da planilha/)).toBe(true);

    await clickButton(/Importar 5 linha/);
    await waitFor(() => expect(upserts).toHaveLength(1));

    const rows = upserts[0].rows;
    expect(rows).toHaveLength(5);
    expect(upserts[0].options).toMatchObject({ onConflict: 'row_hash', ignoreDuplicates: true });
    // compras viram despesa (negativo); estorno vira receita (positivo)
    expect(rows.map(r => r.amount)).toEqual([-60.84, -9.12, -9.12, -60.84, 20]);
    // as duas compras idênticas do mesmo dia ficam (hashes diferentes)
    expect(new Set(rows.map(r => r.row_hash)).size).toBe(5);
    // cartão por bloco; categoria/unidade preenchidas só quando o nome bate (despesa → categoria de despesa)
    expect(rows[0]).toMatchObject({ card_last4: 'VISA INFINITY', unit_id: 'u-fab', category_id: 'c-mp', account_id: 'acc1', status: 'pendente' });
    expect(rows[3]).toMatchObject({ card_last4: 'MASTERCARD BLACK', unit_id: 'u-bou', category_id: 'c-mp' });
    expect(rows[4]).toMatchObject({ unit_id: null, category_id: null });
    // a conferência fecha depois de gravar
    await waitFor(() => expect(has('Conferir antes de importar')).toBe(false));
  });

  it('cancelar não grava nada', async () => {
    const container = await mount(<Page />);
    await waitFor(() => expect(has('Importar planilha')).toBe(true));
    await chooseFile(container, workbookFile());
    await waitFor(() => expect(has('Conferir antes de importar')).toBe(true));
    await clickButton('Cancelar');
    await waitFor(() => expect(has('Conferir antes de importar')).toBe(false));
    expect(upserts).toHaveLength(0);
  });

  it('planilha sem cabeçalho reconhecível mostra o motivo e não abre a conferência', async () => {
    const container = await mount(<Page />);
    await waitFor(() => expect(has('Importar planilha')).toBe(true));
    const ws = XLSX.utils.aoa_to_sheet([['a', 'b'], [1, 2]]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'X');
    const bytes = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
    const file = new File([bytes], 'ruim.xlsx');
    Object.defineProperty(file, 'arrayBuffer', { value: () => Promise.resolve(bytes) });
    await chooseFile(container, file);
    await waitFor(() => expect(has(/Não encontrei a tabela de lançamentos/)).toBe(true));
    expect(has('Conferir antes de importar')).toBe(false);
  });
});
