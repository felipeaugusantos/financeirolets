# Let's Finance

Controle financeiro multiunidades para a Let's Cookies: receitas e despesas, contas a pagar e a receber, conciliação bancária e de cartão, DRE por unidade, iFood, CRM comercial, fábrica e um assistente de IA (Kaikin).

Versão atual: veja [`CHANGELOG.md`](CHANGELOG.md) (a versão exibida no app vem de `APP_VERSION` em `src/lib/appEnv.ts`).

## Módulos

| Área | O que faz |
|---|---|
| Dashboard | Resultado por unidade, previsão de caixa (vencido, 7, 15 e 30 dias), ranking e avisos |
| Lançamentos | Receitas e despesas com rateio entre unidades/frentes, anexos e fechamento de períodos |
| Depreciação e CSLL | Visão contábil reutilizando a lista e o formulário de lançamentos |
| Contas a pagar/receber e Notas | Gestão de títulos e importação de NF-e |
| Relatórios | DRE, DRE Gerencial, DRE Comparativo, fluxo de caixa e conferência de conciliação |
| Conciliação | Extratos OFX e API Bradesco, cartão, regras automáticas e baixa em lote |
| iFood | Importação da planilha do Portal e lançamento semanal dos repasses por loja |
| CRM | Agenda, empresas, funil, busca por CNPJ/Google Maps e pedidos, isolado do financeiro |
| Fábrica & Operações | Produtos, receitas, previsão e fornadas com custo real |
| Chamados | Central de suporte (abertura, resposta e imagens) |
| Configurações e Auditoria | Cadastros, usuários e papéis, qualidade de dados, histórico de alterações |

## Stack

- TypeScript, React 18 e Vite, com componentes Radix/shadcn e Tailwind
- Supabase (Postgres com RLS, autenticação, storage e edge functions em Deno)
- Vitest e Testing Library
- Gerenciador de pacotes: **bun** (`bun.lock` é a fonte; o CI usa `bun install --frozen-lockfile`)

## Rodar localmente

1. Instale as dependências:

```bash
bun install
```

2. Copie o modelo de variáveis e preencha com os valores **públicos** do projeto Supabase (URL, chave publicável e id do projeto). O `.env` não é versionado.

```bash
cp .env.example .env
```

O build e o servidor de desenvolvimento **falham** se `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` ou `VITE_SUPABASE_PROJECT_ID` faltarem (não há valor padrão embutido, para nunca apontar para produção por engano). Um `VITE_SUPABASE_PROJECT_ID` diferente do de produção faz o app se identificar como **homologação**.

3. Suba o app (porta 8080):

```bash
bun run dev
```

## Comandos

```bash
bun run dev        # servidor de desenvolvimento
bun run build      # build de produção
bun run lint       # ESLint (o CI aceita no máximo 16 avisos)
bunx tsc -p tsconfig.app.json --noEmit   # checagem de tipos (strict)
bun run test       # testes (vitest run)
```

### Testes

- A maior parte roda sem rede (regras de negócio, SQL como texto, telas com mocks).
- `src/test/rls.test.ts` e `src/test/crm-isolation.test.ts` falam com um Supabase real e exigem as três variáveis `VITE_SUPABASE_*`. Use o **ambiente de homologação**, não produção.
- Funções SQL são testadas num Postgres descartável: veja [`scripts/testes-sql/README.md`](scripts/testes-sql/README.md).

## Papéis e acesso

Papéis (`app_role`): `admin`, `financeiro`, `gerente_unidade`, `operador` e `vendedor`. Quem não tem nenhum papel não usa o assistente.

- A barreira real é a **RLS do banco**. As telas só evitam caminhos que o banco recusaria.
- Rotas restritas ficam em `src/lib/routeAccess.ts`: `/conciliacao/*` exige admin ou financeiro, `/auditoria` exige admin. O CRM controla o acesso dentro da própria página.

## Edge functions (`supabase/functions`)

| Função | Para quê | Proteções |
|---|---|---|
| `kaikin` | Assistente de IA | JWT + papel, cota por usuário no banco (8/min, 150/dia), 503 se a verificação falhar |
| `crm-discovery` | Busca de empresas (BrasilAPI e Google Maps) | JWT + acesso comercial à unidade, 20 buscas/min por usuário |
| `helpdesk-ticket` | Central de chamados (o token fica só no servidor) | JWT, 10 escritas/min e 30 listagens/min por usuário |

CORS é restrito por `supabase/functions/_shared/cors.ts` (site publicado, previews do Lovable, localhost e `ALLOWED_ORIGINS`). **Se o sistema passar a usar domínio próprio, defina `ALLOWED_ORIGINS` nas funções.** Detalhes em [`docs/kaikin-acesso.md`](docs/kaikin-acesso.md).

Segredos das funções (configurados no ambiente do Supabase/Lovable, nunca no repositório): `LOVABLE_API_KEY`, `GOOGLE_MAPS_API_KEY`, `HELPDESK_TOKEN`.

## Banco de dados e migrações

O SQL chega ao banco por três canais (`supabase/migrations`, `drizzle/migrations` e `scripts/producao`). Leia [`docs/migracoes.md`](docs/migracoes.md) antes de criar ou aplicar migrações, em especial a lacuna conhecida do schema do CRM/Fábrica. Nunca reaplique migrações antigas em produção: use scripts idempotentes. A política de RLS está em [`docs/auditoria-rls.md`](docs/auditoria-rls.md).

## Estrutura

```
src/
  pages/        telas (carregadas sob demanda com React.lazy)
  components/   componentes por módulo (ofx, reports, crm, ifood, factory...) e ui/ (shadcn)
  hooks/        acesso a dados (useSupabaseCrud, useTransactions, useDashboard...)
  lib/          regras de negócio puras e testáveis (dreTotals, finance, ofx*, crmRules...)
  contexts/     autenticação e tema
  integrations/ cliente e tipos gerados do Supabase
  test/         testes
supabase/       edge functions e migrações
drizzle/        schema e migrações do CRM/Fábrica
scripts/        SQL de produção e testes SQL
docs/           documentação técnica
```

## Convenções importantes

As regras completas estão em [`AGENTS.md`](AGENTS.md). As principais:

- Os totais de DRE passam sempre por `src/lib/dreTotals.ts` (um só motor para os três relatórios).
- O CRM não lança receita nem altera o DRE; regras comerciais em `src/lib/crmRules.ts`.
- O iFood é somente leitura, exceto o lançamento semanal explícito por loja, que a conciliação baixa junto com as despesas ligadas.
- Chamados automáticos de falha usam `reportFailureTicket` (no máximo um por erro por dia, nunca interrompem o fluxo).
- Registros do CRM são arquivados, não excluídos.

## Integração contínua

O workflow `.github/workflows/ci.yml` roda em PRs e na `main`:

- `test-build`: testes e build (exige as variáveis `VITE_SUPABASE_*` cadastradas como variáveis do repositório);
- `lint-types`: lint, `tsc` do app e `tsc` estrito da função `kaikin`;
- `migrations-replay`: aplica `supabase/migrations` num Postgres vazio.

## Publicação de versões

A cada publicação: novo bloco no topo de `src/data/releases.ts` (tela Novidades), `APP_VERSION` em `src/lib/appEnv.ts` e entrada no `CHANGELOG.md`, juntos.
