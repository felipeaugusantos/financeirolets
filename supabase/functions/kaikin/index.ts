import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// Tipos mínimos do que esta função lê. O client aqui não usa o Database tipado do app
// (a função é implantada isoladamente), então as linhas são declaradas localmente.
interface UnitRow { id?: string; name: string; code: string | null }
interface FrontRow { name: string }
interface AccountRow { name: string; type: string | null }
interface CategoryRow { name: string; type: string }
interface TxSummaryRow {
  type: string;
  status: string;
  net_amount: number | string | null;
  competence_date: string | null;
  payment_date: string | null;
}
interface AccountBalanceRow { id: string; name: string; initial_balance: number | string | null; initial_balance_date: string | null }
interface AccountMoveRow { account_id: string; type: string; net_amount: number | string | null; payment_date: string }
interface AmountRow { net_amount: number | string | null }
interface TopCategoryRow { type: string; net_amount: number | string | null; category: { name: string } | null }

/** Argumentos que o modelo pode enviar às ferramentas (todos opcionais, validados no uso). */
interface ToolArgs {
  limit?: number | string;
  date_field?: string;
  date_from?: string;
  date_to?: string;
  type?: string;
  unit_id?: string;
  account_id?: string;
  dre_line_id?: string;
  id?: string;
  code?: string;
  kind?: string;
  regime?: string;
  status?: string[];
  due_from?: string;
  due_to?: string;
  missing_category?: boolean;
  missing_unit?: boolean;
  overdue_only?: boolean;
}

interface ToolCall { id: string; function?: { name?: string; arguments?: string } }
interface ChatMessage {
  role: string;
  content?: unknown;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

function errorMessage(e: unknown, fallback: string): string {
  const m = typeof e === 'object' && e !== null ? (e as { message?: unknown }).message : undefined;
  return m == null ? fallback : String(m);
}

const SYSTEM_PROMPT = `Você é o Kaikin, contador-assistente do ERP Let's Finance.

Estilo:
- Sempre responda em português brasileiro, tom amigável e direto.
- Use bullets curtos e negrito para destacar números. Markdown é suportado.
- Nunca invente números. Se faltar dado, use uma das ferramentas (tools) ou diga "não tenho essa informação".
- Não execute nenhuma ação destrutiva — você só lê e explica.

Conhecimento essencial sobre o sistema:
- Cada transação tem competence_date (regime de competência), payment_date (regime de caixa), due_date (vencimento) e status (pendente, agendado, pago, recebido, cancelado).
- "Dashboard" mostra o realizado por competência: status pago/recebido E competence_date dentro do período.
- "DRE Competência (cheio)" inclui também o provisionado (status pendente/agendado).
- "DRE Caixa" usa payment_date dentro do período (somente pagos/recebidos).
- Identidades-chave:
  • Dashboard + Provisionado = DRE Competência cheio
  • Dashboard + Pagos de períodos anteriores − Pagos fora do período = DRE Caixa
- Flags comuns do checklist:
  • provisionadoVencido — due_date < hoje e ainda em aberto
  • missingCategory/missingUnit/missingFront — lançamentos não classificados
  • pagoSemData — marcado como pago mas sem payment_date (quebra DRE Caixa)
  • pagoForaDaCompetencia — competência no período mas pagamento antes/depois
  • negativeOrZero — líquido ≤ 0 (suspeito)

Uso das ferramentas (sempre prefira consultar a responder de memória):
- list_entities — descubra IDs de unidades, frentes e contas ANTES de filtrar por nome.
- list_transactions / get_transaction — detalhes de lançamentos.
- summarize_period — totais por regime (dashboard, provisionado, caixa).
- account_balances — saldo das contas bancárias.
- list_open_bills — contas a pagar/receber em aberto e atrasadas.
- top_categories — ranking de categorias por valor no período.
- list_dre_lines / list_categories — estrutura do DRE.

Jargão do negócio (use exatamente esse vocabulário nas respostas):
- "Unidade" = unidade de negócio (loja/fábrica/franqueadora). Nunca diga "filial", "empresa" ou "centro de custo".
- "Frente" (frente de negócio) = linha de atuação dentro da unidade (ex.: varejo, eventos, institucional/administrativo). É opcional no lançamento.
- "Conta" = conta bancária ou caixa (accounts). Fale "conta Bradesco Boulevard", não "banco 237".
- "Categoria" = plano de contas do lançamento, sempre de receita ou despesa, e ligada a uma linha do DRE.
- "Lançamento" = transação (receita ou despesa). Nunca diga "movimento", "registro" ou "entrada contábil".
- "Rateio" = divisão do valor de um lançamento entre unidades/frentes (allocations). Um rateio precisa fechar 100% do valor.
- "Baixa" = marcar um lançamento como pago/recebido, com data de pagamento.
- "Conciliação bancária" = casar linhas do extrato OFX com lançamentos; "vincular" (ligar a um lançamento existente), "criar lançamento" e "ignorar" são as três ações. "Conciliação de cartão" usa planilha da operadora.
- "Provisionado" = pendente/agendado, ainda não pago. "Realizado" = já pago/recebido.
- "Competência" = mês do fato gerador; "Caixa" = mês em que o dinheiro entrou/saiu.
- "DRE Gerencial" = visão com margem bruta e EBITDA. "DRE Comparativo" = unidades lado a lado.
- "Sem unidade" = lançamento não classificado, precisa ser corrigido pelo operador.

Regras de resposta:
- Formate dinheiro em reais (R$ 1.234,56) e datas como DD/MM/AAAA.
- Ao listar lançamentos, mostre uma tabela markdown enxuta (data, descrição, unidade, valor) e o total.
- Sempre cite unidades, frentes, contas e categorias pelo NOME cadastrado (nunca por ID nem por apelido inventado).
- Se o usuário citar um nome de unidade/conta/categoria, resolva o ID via ferramenta; nunca chute. Se o nome não existir, diga quais existem.`;

const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'list_transactions',
      description: 'Lista transações com filtros. Use para responder "quais são esses N itens?". Máx 50 linhas por chamada.',
      parameters: {
        type: 'object',
        properties: {
          date_from: { type: 'string', description: 'YYYY-MM-DD' },
          date_to: { type: 'string', description: 'YYYY-MM-DD' },
          date_field: { type: 'string', enum: ['competence_date', 'payment_date', 'due_date'], description: 'Qual data filtrar. Default competence_date.' },
          status: { type: 'array', items: { type: 'string' }, description: 'pendente|agendado|pago|recebido|cancelado' },
          type: { type: 'string', enum: ['receita', 'despesa'] },
          unit_id: { type: 'string' },
          missing_category: { type: 'boolean' },
          missing_unit: { type: 'boolean' },
          overdue_only: { type: 'boolean', description: 'due_date < hoje e em aberto' },
          limit: { type: 'number', description: 'até 50' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_transaction',
      description: 'Detalhe completo de uma transação por ID.',
      parameters: {
        type: 'object',
        properties: { id: { type: 'string' } },
        required: ['id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'summarize_period',
      description: 'Agrega totais de receita e despesa por status para um período/unidade. Use para checar identidades em outro período.',
      parameters: {
        type: 'object',
        properties: {
          date_from: { type: 'string' },
          date_to: { type: 'string' },
          unit_id: { type: 'string' },
        },
        required: ['date_from', 'date_to'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_dre_lines',
      description: 'Estrutura DRE (code, name, sign). Use para explicar onde uma categoria entra.',
      parameters: { type: 'object', properties: { code: { type: 'string' } } },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_categories',
      description: 'Categorias e a qual linha do DRE pertencem.',
      parameters: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: ['receita', 'despesa'] },
          dre_line_id: { type: 'string' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_entities',
      description: 'Lista unidades, frentes de negócio e contas bancárias com seus nomes e IDs. Use SEMPRE que o usuário citar uma unidade/frente/conta pelo nome, para descobrir o ID antes de filtrar.',
      parameters: {
        type: 'object',
        properties: {
          kind: { type: 'string', enum: ['units', 'fronts', 'accounts', 'all'], description: 'Default all.' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'account_balances',
      description: 'Saldo atual de cada conta bancária (saldo inicial na data-base + lançamentos pagos/recebidos que afetam o caixa, posteriores à data-base e até a data informada).',
      parameters: {
        type: 'object',
        properties: {
          date_to: { type: 'string', description: 'YYYY-MM-DD. Default hoje.' },
          account_id: { type: 'string' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_open_bills',
      description: 'Contas a pagar/receber em aberto (pendente ou agendado), ordenadas por vencimento. Use para "o que vence", "atrasados", "quanto tenho a pagar".',
      parameters: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: ['receita', 'despesa'] },
          due_from: { type: 'string' },
          due_to: { type: 'string' },
          overdue_only: { type: 'boolean' },
          unit_id: { type: 'string' },
          limit: { type: 'number', description: 'até 50' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'top_categories',
      description: 'Ranking de categorias por valor em um período (regime de competência ou caixa). Use para "onde estou gastando mais".',
      parameters: {
        type: 'object',
        properties: {
          date_from: { type: 'string' },
          date_to: { type: 'string' },
          type: { type: 'string', enum: ['receita', 'despesa'] },
          regime: { type: 'string', enum: ['competencia', 'caixa'], description: 'Default competencia.' },
          unit_id: { type: 'string' },
        },
        required: ['date_from', 'date_to'],
      },
    },
  },
];

function todaySaoPaulo(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function makeClient(authHeader: string | null) {
  const url = Deno.env.get('SUPABASE_URL')!;
  const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
  return createClient(url, anon, {
    global: { headers: authHeader ? { Authorization: authHeader } : {} },
    auth: { persistSession: false },
  });
}

// Vocabulário real do cliente: nomes cadastrados de unidades, frentes, contas e categorias.
async function buildGlossary(supabase: ReturnType<typeof makeClient>): Promise<string | null> {
  try {
    const [units, fronts, accounts, categories] = await Promise.all([
      supabase.from('units').select('name, code').eq('active', true).order('name'),
      supabase.from('business_fronts').select('name').eq('active', true).order('name'),
      supabase.from('accounts').select('name, type').eq('active', true).order('name'),
      supabase.from('categories').select('name, type').eq('active', true).order('name').limit(200),
    ]);

    const list = <R,>(rows: R[] | null, fmt: (r: R) => string) =>
      (rows ?? []).map(fmt).join(', ') || '(nenhum cadastrado)';

    const categoryRows = (categories.data ?? []) as CategoryRow[];
    const receitas = categoryRows.filter((c) => c.type === 'receita');
    const despesas = categoryRows.filter((c) => c.type === 'despesa');

    const unitsTxt = list(units.data as UnitRow[] | null, (u) => (u.code ? u.name + ' (' + u.code + ')' : u.name));
    const frontsTxt = list(fronts.data as FrontRow[] | null, (f) => f.name);
    const accountsTxt = list(accounts.data as AccountRow[] | null, (a) => (a.type ? a.name + ' [' + a.type + ']' : a.name));
    const receitasTxt = list(receitas, (c) => c.name);
    const despesasTxt = list(despesas, (c) => c.name);

    return [
      'Cadastros reais deste workspace (use estes nomes exatos ao responder):',
      '- Unidades: ' + unitsTxt,
      '- Frentes de negócio: ' + frontsTxt,
      '- Contas: ' + accountsTxt,
      '- Categorias de receita: ' + receitasTxt,
      '- Categorias de despesa: ' + despesasTxt,
      'Se o usuário usar um apelido parecido com um desses nomes, assuma que é ele e confirme na resposta.',
    ].join('\n');
  } catch (_e) {
    return null;
  }
}

async function runTool(name: string | undefined, args: ToolArgs, supabase: ReturnType<typeof makeClient>) {
  try {
    if (name === 'list_transactions') {
      const limit = Math.min(Number(args.limit) || 25, 50);
      const field = args.date_field || 'competence_date';
      let q = supabase
        .from('transactions')
        .select('id, type, description, net_amount, status, competence_date, payment_date, due_date, payment_method, unit:units(name), category:categories(name), front:business_fronts(name), account:accounts(name)')
        .limit(limit);
      if (args.date_from) q = q.gte(field, args.date_from);
      if (args.date_to) q = q.lte(field, args.date_to);
      if (args.type) q = q.eq('type', args.type);
      if (args.unit_id) q = q.eq('unit_id', args.unit_id);
      if (Array.isArray(args.status) && args.status.length) q = q.in('status', args.status);
      if (args.missing_category) q = q.is('category_id', null);
      if (args.missing_unit) q = q.is('unit_id', null);
      if (args.overdue_only) {
        const today = todaySaoPaulo();
        q = q.in('status', ['pendente', 'agendado']).lt('due_date', today);
      }
      q = q.not('status', 'eq', 'cancelado');
      const { data, error } = await q;
      if (error) return { error: error.message };
      return { count: data?.length ?? 0, items: data ?? [] };
    }

    if (name === 'get_transaction') {
      const { data, error } = await supabase
        .from('transactions')
        .select('*')
        .eq('id', args.id)
        .maybeSingle();
      if (error) return { error: error.message };
      return data ?? { error: 'não encontrado' };
    }

    if (name === 'summarize_period') {
      let q = supabase
        .from('transactions')
        .select('type, status, net_amount, competence_date, payment_date')
        .or(`and(competence_date.gte.${args.date_from},competence_date.lte.${args.date_to}),and(payment_date.gte.${args.date_from},payment_date.lte.${args.date_to})`)
        .not('status', 'eq', 'cancelado')
        .limit(10000);
      if (args.unit_id) q = q.eq('unit_id', args.unit_id);
      const { data, error } = await q;
      if (error) return { error: error.message };
      const agg = { receita: { dashboard: 0, provisionado: 0, caixa: 0, count: 0 }, despesa: { dashboard: 0, provisionado: 0, caixa: 0, count: 0 } };
      const f = args.date_from as string, t = args.date_to as string;
      ((data ?? []) as TxSummaryRow[]).forEach((tx) => {
        const v = Number(tx.net_amount) || 0;
        const side = tx.type === 'receita' ? agg.receita : agg.despesa;
        side.count++;
        const compIn = tx.competence_date && tx.competence_date >= f && tx.competence_date <= t;
        const payIn = tx.payment_date && tx.payment_date >= f && tx.payment_date <= t;
        const paid = tx.status === 'pago' || tx.status === 'recebido';
        const prov = tx.status === 'pendente' || tx.status === 'agendado';
        if (compIn && paid) side.dashboard += v;
        if (compIn && prov) side.provisionado += v;
        if (payIn && paid) side.caixa += v;
      });
      return agg;
    }

    if (name === 'list_dre_lines') {
      let q = supabase.from('dre_lines').select('id, code, name, sign, parent_id, is_subtotal, sort_order').eq('active', true).order('sort_order');
      if (args.code) q = q.eq('code', args.code);
      const { data, error } = await q;
      if (error) return { error: error.message };
      return data ?? [];
    }

    if (name === 'list_categories') {
      let q = supabase.from('categories').select('id, name, type, dre_line_id, parent_id').eq('active', true).limit(200);
      if (args.type) q = q.eq('type', args.type);
      if (args.dre_line_id) q = q.eq('dre_line_id', args.dre_line_id);
      const { data, error } = await q;
      if (error) return { error: error.message };
      return data ?? [];
    }

    if (name === 'list_entities') {
      const kind = args.kind || 'all';
      const out: { units?: unknown[]; fronts?: unknown[]; accounts?: unknown[] } = {};
      if (kind === 'all' || kind === 'units') {
        const { data } = await supabase.from('units').select('id, name, code').eq('active', true).order('name');
        out.units = data ?? [];
      }
      if (kind === 'all' || kind === 'fronts') {
        const { data } = await supabase.from('business_fronts').select('id, name').eq('active', true).order('name');
        out.fronts = data ?? [];
      }
      if (kind === 'all' || kind === 'accounts') {
        const { data } = await supabase.from('accounts').select('id, name, type').eq('active', true).order('name');
        out.accounts = data ?? [];
      }
      return out;
    }

    if (name === 'account_balances') {
      const dateTo = args.date_to || todaySaoPaulo();
      let accQ = supabase.from('accounts').select('id, name, initial_balance, initial_balance_date').eq('active', true);
      if (args.account_id) accQ = accQ.eq('id', args.account_id);
      const { data: accounts, error: accErr } = await accQ;
      if (accErr) return { error: accErr.message };

      // Mesma regra de src/lib/finance.ts (accountBalanceAt): só lançamentos pagos que afetam o caixa e
      // posteriores à data-base (o movimento até a data-base já está no saldo inicial).
      let txQ = supabase
        .from('transactions')
        .select('account_id, type, net_amount, payment_date')
        .in('status', ['pago', 'recebido'])
        .eq('affects_cashflow', true)
        .not('payment_date', 'is', null)
        .lte('payment_date', dateTo)
        .limit(20000);
      if (args.account_id) txQ = txQ.eq('account_id', args.account_id);
      const { data: txs, error: txErr } = await txQ;
      if (txErr) return { error: txErr.message };

      return {
        date_to: dateTo,
        accounts: ((accounts ?? []) as AccountBalanceRow[]).map((a) => {
          const moves = ((txs ?? []) as AccountMoveRow[]).filter(
            (t) => t.account_id === a.id && (!a.initial_balance_date || t.payment_date > a.initial_balance_date)
          );
          const delta = moves.reduce(
            (s: number, t) => s + (t.type === 'receita' ? 1 : -1) * (Number(t.net_amount) || 0),
            0
          );
          return {
            id: a.id,
            name: a.name,
            initial_balance: Number(a.initial_balance) || 0,
            movimentacao: delta,
            saldo: (Number(a.initial_balance) || 0) + delta,
          };
        }),
      };
    }

    if (name === 'list_open_bills') {
      const limit = Math.min(Number(args.limit) || 25, 50);
      let q = supabase
        .from('transactions')
        .select('id, type, description, net_amount, status, due_date, unit:units(name), category:categories(name)')
        .in('status', ['pendente', 'agendado'])
        .order('due_date', { ascending: true })
        .limit(limit);
      if (args.type) q = q.eq('type', args.type);
      if (args.unit_id) q = q.eq('unit_id', args.unit_id);
      if (args.due_from) q = q.gte('due_date', args.due_from);
      if (args.due_to) q = q.lte('due_date', args.due_to);
      if (args.overdue_only) q = q.lt('due_date', todaySaoPaulo());
      const { data, error } = await q;
      if (error) return { error: error.message };
      const total = ((data ?? []) as AmountRow[]).reduce((s: number, t) => s + (Number(t.net_amount) || 0), 0);
      return { hoje: todaySaoPaulo(), count: data?.length ?? 0, total, items: data ?? [] };
    }

    if (name === 'top_categories') {
      const regime = args.regime === 'caixa' ? 'caixa' : 'competencia';
      const field = regime === 'caixa' ? 'payment_date' : 'competence_date';
      let q = supabase
        .from('transactions')
        .select('type, net_amount, status, category:categories(name)')
        .gte(field, args.date_from)
        .lte(field, args.date_to)
        .not('status', 'eq', 'cancelado')
        .limit(20000);
      if (regime === 'caixa') q = q.in('status', ['pago', 'recebido']);
      if (args.type) q = q.eq('type', args.type);
      if (args.unit_id) q = q.eq('unit_id', args.unit_id);
      const { data, error } = await q;
      if (error) return { error: error.message };
      const map = new Map<string, { categoria: string; tipo: string; total: number; count: number }>();
      ((data ?? []) as unknown as TopCategoryRow[]).forEach((t) => {
        const nome = t.category?.name ?? 'Sem categoria';
        const key = `${t.type}|${nome}`;
        const cur = map.get(key) ?? { categoria: nome, tipo: t.type, total: 0, count: 0 };
        cur.total += Number(t.net_amount) || 0;
        cur.count++;
        map.set(key, cur);
      });
      return {
        regime,
        items: [...map.values()].sort((a, b) => b.total - a.total).slice(0, 25),
      };
    }

    return { error: `tool desconhecida: ${name}` };
  } catch (e: unknown) {
    return { error: errorMessage(e, 'erro desconhecido') };
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: 'LOVABLE_API_KEY não configurada' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { messages = [], pageContext = null } = (await req.json()) as {
      messages?: { role?: string; content?: unknown }[];
      pageContext?: unknown;
    };
    const supabase = makeClient(req.headers.get('Authorization'));

    const chatMessages: ChatMessage[] = [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'system', content: `Hoje (America/Sao_Paulo) é ${todaySaoPaulo()}. Sempre use essa data como "hoje".` },
    ];
    const glossary = await buildGlossary(supabase);
    if (glossary) chatMessages.push({ role: 'system', content: glossary });
    if (pageContext) {
      chatMessages.push({
        role: 'system',
        content: `Contexto da tela atual (JSON):\n\`\`\`json\n${JSON.stringify(pageContext, null, 2)}\n\`\`\``,
      });
    }
    for (const m of messages) {
      if (m?.role && m?.content !== undefined) {
        chatMessages.push({ role: m.role, content: m.content });
      }
    }

    // Loop tool calling (até 4 hops). Sempre não-stream — emulamos SSE no final.
    let finalContent = '';
    let hops = 0;
    while (hops < 5) {
      const resp = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'google/gemini-3-flash-preview',
          messages: chatMessages,
          tools: TOOLS,
          tool_choice: 'auto',
        }),
      });

      if (!resp.ok) {
        if (resp.status === 429 || resp.status === 402) {
          return new Response(JSON.stringify({ error: resp.status === 429 ? 'Rate limit excedido' : 'Créditos esgotados' }), {
            status: resp.status,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        const t = await resp.text();
        console.error('AI gateway error', resp.status, t);
        return new Response(JSON.stringify({ error: 'AI gateway error' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const payload = await resp.json();
      const msg = payload?.choices?.[0]?.message;
      const toolCalls = msg?.tool_calls;
      if (!toolCalls || toolCalls.length === 0) {
        finalContent = msg?.content ?? '';
        break;
      }
      chatMessages.push({ role: 'assistant', content: msg.content ?? null, tool_calls: toolCalls });
      for (const tc of toolCalls) {
        let args: ToolArgs = {};
        try { args = JSON.parse(tc.function?.arguments ?? '{}'); } catch { /* ignore */ }
        console.log('[kaikin] tool', tc.function?.name, args);
        const result = await runTool(tc.function?.name, args, supabase);
        chatMessages.push({
          role: 'tool',
          tool_call_id: tc.id,
          content: JSON.stringify(result).slice(0, 12000),
        });
      }
      hops++;
    }

    if (!finalContent) {
      finalContent = '_Não consegui formular uma resposta. Tente reformular sua pergunta._';
    }

    // Emula SSE no formato OpenAI para o front consumir com o mesmo parser
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const chunks = finalContent.match(/[\s\S]{1,40}/g) ?? [finalContent];
        for (const chunk of chunks) {
          const evt = {
            choices: [{ index: 0, delta: { content: chunk } }],
          };
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(evt)}\n\n`));
          await new Promise((r) => setTimeout(r, 15));
        }
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        controller.close();
      },
    });

    return new Response(stream, {
      headers: { ...corsHeaders, 'Content-Type': 'text/event-stream' },
    });
  } catch (e: unknown) {
    console.error('kaikin fatal', e);
    return new Response(JSON.stringify({ error: errorMessage(e, 'erro') }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
