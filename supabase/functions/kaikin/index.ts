import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

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

Quando o usuário pedir detalhes de transações específicas, use a tool list_transactions ou get_transaction. Use summarize_period se ele perguntar sobre outro período/unidade que não esteja no contexto da página.`;

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

async function runTool(name: string, args: any, supabase: ReturnType<typeof makeClient>) {
  try {
    if (name === 'list_transactions') {
      const limit = Math.min(Number(args.limit) || 25, 50);
      const field = args.date_field || 'competence_date';
      let q = supabase
        .from('transactions')
        .select('id, type, description, net_amount, status, competence_date, payment_date, due_date, unit_id, category_id, front_id')
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
      const f = args.date_from, t = args.date_to;
      (data ?? []).forEach((tx: any) => {
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

    return { error: `tool desconhecida: ${name}` };
  } catch (e: any) {
    return { error: e?.message ?? 'erro desconhecido' };
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

    const { messages = [], pageContext = null } = await req.json();
    const supabase = makeClient(req.headers.get('Authorization'));

    const chatMessages: any[] = [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'system', content: `Hoje (America/Sao_Paulo) é ${todaySaoPaulo()}. Sempre use essa data como "hoje".` },
    ];
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
        let args: any = {};
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
  } catch (e: any) {
    console.error('kaikin fatal', e);
    return new Response(JSON.stringify({ error: e?.message ?? 'erro' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
