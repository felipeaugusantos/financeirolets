
## Visão geral

Criar **Kaikin**, um assistente em chat (FAB global) que aparece em todas as telas do Let's Finance. Foco principal: explicar divergências, regras contábeis e itens do checklist da Reconciliação em linguagem simples, com poder de consultar transações sob demanda via tools.

Sem ações destrutivas — só leitura e explicação. Aproveita Lovable AI (`google/gemini-3-flash-preview` por padrão) através de edge function.

## Arquitetura

```text
┌─────────── Front (React) ───────────┐    ┌──── Supabase Edge Function ─────┐
│ KaikinFab (botão flutuante)         │    │ /functions/kaikin                │
│  └ KaikinChat (drawer/sheet)        │───▶│  - Recebe messages + page ctx    │
│      • Markdown + streaming         │    │  - Loop tool-calling (até 4 hops)│
│      • KaikinContext (React)        │◀───│  - Tools de leitura no DB        │
│        coleta contexto da página    │    │  - Stream SSE de volta           │
└─────────────────────────────────────┘    └──────────────────────────────────┘
```

## Componentes front

1. **`KaikinProvider`** (`src/components/kaikin/KaikinProvider.tsx`)
   - Context React. Mantém: `isOpen`, `messages[]`, `pageContext` (objeto livre setado por cada tela), `pushContext()`, `clearContext()`.
   - Monta uma vez no `App.tsx`.

2. **`KaikinFab`** (`src/components/kaikin/KaikinFab.tsx`)
   - Botão flutuante (`fixed bottom-4 right-4`), ícone `Sparkles`, cor primary, oculto em rotas `/login` e `/auth`.
   - Abre `KaikinSheet`.

3. **`KaikinSheet`** (`src/components/kaikin/KaikinSheet.tsx`)
   - Drawer lateral (`Sheet` do shadcn, side="right", largura `md:w-[420px]`).
   - Header: avatar "K", nome "Kaikin", subtítulo dinâmico ("Vendo: Reconciliação Nov/2025").
   - Lista de mensagens com `react-markdown` (já presente? checar — se não, adicionar).
   - Input + botão enviar. Estado de "Kaikin pensando…" com spinner.
   - Sugestões iniciais (chips) que mudam conforme `pageContext.scope`:
     - Reconciliação: "Por que Dashboard e DRE divergem?", "O que são pagos fora da competência?", "Liste os itens vencidos".
     - Genérico (outras telas): "O que é DRE Caixa vs Competência?".

4. **`useKaikinStream`** (`src/hooks/useKaikinStream.ts`)
   - Faz POST para `/functions/v1/kaikin` com `{ messages, pageContext }`.
   - Parser SSE token-by-token conforme padrão do `ai-gateway` (line-by-line, trata `[DONE]`, JSON parcial, CRLF, 429/402 com toast).

5. **Integração na Reconciliação**
   - `ReconciliationReport.tsx` chama `useKaikinContext()` num `useEffect` e injeta:
     ```ts
     {
       scope: 'reconciliacao',
       period: { from, to },
       unit_id,
       totals: { receitas: rec, despesas: des }, // só campos numéricos da SideData (sem items/details)
       checklist: data.checklist.map(c => ({ id, severity, title, count, amount, side })),
     }
     ```
   - Limpa contexto no unmount.

## Edge function `supabase/functions/kaikin/index.ts`

- `verify_jwt = true` em `supabase/config.toml` (precisa de usuário logado — usa o token para autenticar consultas com RLS).
- Aceita `{ messages: ChatMessage[], pageContext: object }`.
- System prompt fixo no backend: define personalidade ("Você é Kaikin, contador-assistente do Let's Finance. Fale em português direto, evite jargão, use bullets curtos. Sempre cite IDs ou contagens quando estiverem no contexto. Nunca invente números — se faltar dado, use uma tool ou diga 'não tenho essa informação'."), explica as identidades-chave da reconciliação (Dashboard + Provisionado = DRE Competência; Dashboard + Δcaixa = DRE Caixa) e lista as regras de cada flag.
- Anexa `pageContext` como mensagem `system` adicional logo após o prompt principal (JSON formatado).
- Chama Lovable AI Gateway em modo `stream: true` com `tools` registradas (abaixo). Loop tool-calling: enquanto resposta tiver `tool_calls`, executa e re-chama o gateway com o resultado; máx 4 iterações.
- Stream de volta apenas tokens `delta.content` (as chamadas de tool ficam silenciosas; opcionalmente envia eventos custom `event: tool` para o front exibir "Consultando transações vencidas…").
- Erros 402/429 retornados como JSON com `error` e status apropriado, conforme padrão.

### Tools registradas (todas read-only)

| Nome | Descrição | Parâmetros |
|---|---|---|
| `list_transactions` | Busca transações com filtros. | `date_from`, `date_to`, `status?`, `type?`, `unit_id?`, `missing_category?`, `missing_unit?`, `overdue_only?`, `limit?` (max 50) |
| `get_transaction` | Detalhe completo de 1 transação por ID. | `id` |
| `list_dre_lines` | Retorna a estrutura DRE (code, name, parent, sign) para explicar onde cada categoria entra. | `code?` |
| `list_categories` | Categorias mapeadas a DRE lines. | `type?`, `dre_line_id?` |
| `summarize_period` | Roda a mesma agregação do `useReconciliation` para um período/unidade e devolve os totais e contagens (sem listar items). | `date_from`, `date_to`, `unit_id?` |

Implementação: cada handler usa o Supabase client criado com `Deno.env.get('SUPABASE_URL')` + token Authorization do usuário (RLS preservada). Limite forte: `list_transactions` força `.limit(50)`, devolve só colunas essenciais (id, description, net_amount, status, due_date, payment_date, competence_date, type) para caber no contexto.

## Mudanças no schema

Nenhuma. Sem nova tabela — conversas são efêmeras (apenas em memória do front). Persistência fica para um v2.

## Detalhes técnicos

- **Streaming**: padrão SSE descrito em `connecting-to-ai-models`. Frontend usa `import.meta.env.VITE_SUPABASE_URL` + `VITE_SUPABASE_PUBLISHABLE_KEY`.
- **Markdown**: usa `react-markdown` com `prose prose-sm` (Tailwind typography) — checar se já está instalado; se não, plano inclui `bun add react-markdown`.
- **Modelo**: `google/gemini-3-flash-preview` (default, barato, suporta tool calling). Pode trocar para `google/gemini-2.5-pro` em casos mais complexos via env, mas v1 não expõe seletor.
- **Limite de contexto**: trunca `messages` aos últimos 12 turnos no front antes de enviar, para evitar custo descontrolado.
- **Telemetria mínima**: console.log no edge function do número de tool calls e tokens recebidos (sem persistir).

## Design

- Avatar/nome **Kaikin** com gradiente Rosa→Turquesa (cores do brand já no design system).
- FAB: 56×56, sombra `shadow-elevated`, hover anima escala 1.05.
- Bolhas: assistente em `bg-muted`, usuário em `bg-primary text-primary-foreground`.
- Empty state: avatar grande + "Oi, sou o Kaikin 👋 Como posso ajudar a fechar o mês?" + chips de sugestão.

## Arquivos novos / alterados

Novos:
- `src/components/kaikin/KaikinProvider.tsx`
- `src/components/kaikin/KaikinFab.tsx`
- `src/components/kaikin/KaikinSheet.tsx`
- `src/components/kaikin/KaikinMessage.tsx` (renderiza markdown + estados)
- `src/hooks/useKaikinStream.ts`
- `src/hooks/useKaikinContext.ts` (atalho `usePageContext`)
- `supabase/functions/kaikin/index.ts`
- `supabase/functions/kaikin/tools.ts` (handlers das tools)

Alterados:
- `src/App.tsx` — envolve com `KaikinProvider` e monta `KaikinFab` fora das rotas de auth.
- `src/components/reports/ReconciliationReport.tsx` — injeta `pageContext` com checklist+totais.
- `supabase/config.toml` — adiciona bloco para função `kaikin`.

Dependências: possivelmente `react-markdown` (verificar antes).

## Fora de escopo (v1)

- Persistência de histórico de chat.
- Ações executivas (classificar/baixar transações).
- Tools de escrita.
- Resumo executivo exportável (pode virar uma tool num v2).
- Multi-conversa / threads.
- Voz / anexos.
