import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const h = vi.hoisted(() => ({
  toast: vi.fn(),
  plan: vi.fn(),
  commit: vi.fn(),
}));
const toastApi = { toast: h.toast };
vi.mock('@/hooks/use-toast', () => ({ useToast: () => toastApi }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));
vi.mock('@/lib/bankApiImport', () => ({ planApiImport: h.plan, commitApiImport: h.commit }));

import BankApiImportDialog from '@/components/ofx/BankApiImportDialog';
import { parseApiResponse } from '@/lib/bradescoApi';

const json = JSON.stringify({
  extratoPorPeriodo: {
    codigoRetorno: '00', numeroConta: '75557', digitoConta: '5', identificadorTipoConta: 'conta corrente',
    lstLancamentoMensal: [
      { dataLancamento: '30/09/2024', numeroDocumento: '0000000', valorLancamento: '0,00', sinalLancamento: '+', valorSaldoAposLancamento: '80,00', sinalSaldo: '+', tipoLancamento: '01', descritivoLancamentoAbreviado: 'Saldo Anterior' },
      { dataLancamento: '01/10/2024', numeroDocumento: '0000001', valorLancamento: '700,00', sinalLancamento: '-', valorSaldoAposLancamento: '620,00', sinalSaldo: '-', tipoLancamento: '02', codigoLancamento: '03205', descritivoLancamentoCompleto: 'TRANSFERENCIA PIX' },
    ],
  },
});

let root: Root | null = null;
const onImported = vi.fn();
const onOpenChange = vi.fn();

const text = () => document.body.textContent ?? '';
const button = (label: RegExp) => [...document.body.querySelectorAll('button')].find(b => label.test(b.textContent ?? '')) as HTMLButtonElement;

async function render() {
  await act(async () => {
    root!.render(<BankApiImportDialog open onOpenChange={onOpenChange} accountId="a1" accountName="Bradesco PJ" onImported={onImported} />);
  });
}
async function paste(value: string) {
  const ta = document.body.querySelector('textarea') as HTMLTextAreaElement;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(ta, value);
    ta.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
const click = (b: HTMLButtonElement) => act(async () => { b.click(); });

beforeEach(() => {
  h.toast.mockReset(); h.plan.mockReset(); h.commit.mockReset(); onImported.mockReset(); onOpenChange.mockReset();
  h.plan.mockImplementation(async (parsed) => ({
    kind: 'extrato', accountId: 'a1', parsed, toInsert: parsed.entries, alreadyImported: [], alreadyFromOfx: [],
  }));
  h.commit.mockResolvedValue({ inserted: 1, skipped: 0, notes: [] });
  const host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => { act(() => root?.unmount()); root = null; document.body.innerHTML = ''; });

describe('BankApiImportDialog', () => {
  it('Analisar fica desabilitado sem texto', async () => {
    await render();
    expect(button(/Analisar/).disabled).toBe(true);
  });

  it('JSON inválido mostra o erro e não consulta o banco', async () => {
    await render();
    await paste('{oi');
    await click(button(/Analisar/));
    expect(text()).toContain('não é um JSON válido');
    expect(h.plan).not.toHaveBeenCalled();
  });

  it('extrato válido: mostra o resumo, a linha e o saldo; confirmar grava e avisa o período', async () => {
    await render();
    await paste(json);
    await click(button(/Analisar/));
    expect(h.plan).toHaveBeenCalledTimes(1);
    expect(text()).toContain('1 novo(s)');
    expect(text()).toContain('TRANSFERENCIA PIX');
    expect(text()).toContain('75557-5');
    const confirm = button(/Importar 1 linha/);
    expect(confirm.disabled).toBe(false);

    await click(confirm);
    expect(h.commit).toHaveBeenCalledTimes(1);
    expect(h.commit.mock.calls[0][1]).toBe('u1');
    expect(onImported).toHaveBeenCalledWith({ from: '2024-10-01', to: '2024-10-01' });
    expect(h.toast).toHaveBeenCalledWith(expect.objectContaining({ title: '1 linha(s) de extrato importada(s)' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('nada novo para importar: o botão fica desabilitado', async () => {
    h.plan.mockImplementation(async (parsed) => ({
      kind: 'extrato', accountId: 'a1', parsed, toInsert: [], alreadyImported: parsed.entries, alreadyFromOfx: [],
    }));
    await render();
    await paste(json);
    await click(button(/Analisar/));
    expect(text()).toContain('0 novo(s)');
    expect(button(/Importar 0 linha/).disabled).toBe(true);
  });

  it('erro da importação (ex.: conta de outro banco) aparece e não fecha a tela', async () => {
    h.plan.mockRejectedValue(new Error('Importação bloqueada: a resposta é da conta 75557-5'));
    await render();
    await paste(json);
    await click(button(/Analisar/));
    expect(text()).toContain('Importação bloqueada');
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it('saldo: mostra os valores e registra', async () => {
    h.plan.mockImplementation(async (parsed) => ({ kind: 'saldo', accountId: 'a1', parsed, refDate: '2026-10-27' }));
    h.commit.mockResolvedValue({ inserted: 0, skipped: 0, notes: [] });
    await render();
    await paste(JSON.stringify({
      saldoCC: { codigoRetorno: '00', numeroConta: '75557', digitoConta: '5', identificadorTipoConta: 'conta corrente',
        lstLancamentosSaldos: [{ nomeProduto: '= TOTAL DE RECURSOS', codigoProduto: 995, valorLancamento: '77,95', sinalSaldo: '+' }] },
    }));
    await click(button(/Analisar/));
    expect(text()).toContain('TOTAL DE RECURSOS');
    expect(text()).toContain('27/10/2026');
    await click(button(/Registrar saldo/));
    expect(h.commit).toHaveBeenCalledTimes(1);
    expect(onImported).toHaveBeenCalledWith(null);
  });

  it('o analisador de resposta usado pela tela é o mesmo dos testes da lib', () => {
    expect(parseApiResponse(json).kind).toBe('extrato');
  });
});
