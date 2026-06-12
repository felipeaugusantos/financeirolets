# Memory: index.md
Updated: now

# Project Memory

## Core
- Let's Finance ERP (Let's Cookies). Foco multiunidades e comissões.
- Design: Rosa (#E91E63), Turquesa (#00B8C8), Mel (#D89B2B). Fontes Poppins/Inter.
- Lovable Cloud + Supabase (DB, Auth Email/Google, Storage).
- Mobile-first (PWA) otimizado para iPhone, fluxos rápidos em até 2 toques.
- Políticas RLS no Supabase devem ser permissivas p/ evitar bloqueios de consultas.
- Padrão CRUD: usar hook `useSupabaseCrud` e componentes `CrudTable`/`CrudDialog`.
- Segurança: Proibido excluir lançamentos pagos por usuários comuns; usar estorno/cancelamento. Manter rastreabilidade de logs.
- Formulários: Selects de entidades devem permitir criação inline via botão "+ Adicionar".

## Memories
- [Estrutura Unidades](mem://domain/estrutura-unidades) — Gestão multiunidades de negócio e bandeiras com contas bancárias específicas.
- [Classificação de Negócio](mem://domain/classificacao-negocio) — Frente de negócio opcional, "Institucional/Administrativo" para suporte.
- [RBAC Roles](mem://auth/rbac-roles) — Perfis (Admin, Fin, Gerente, Operador, Vendedor) e restrição de visibilidade.
- [Promoção Admin](mem://auth/auto-admin-promotion) — 2 primeiros usuários recebem Admin via trigger de DB.
- [Sistema de Comissões](mem://features/commission-system) — Regras de comissão por unidade/frente, bruta ou líquida.
- [Transações: Lógica](mem://features/transacoes/logica-negocio) — Cálculo de impostos líquidos, parcelas e rateio de custos.
- [Transações: Anexos](mem://features/transacoes/anexos) — Suporte a múltiplos anexos em JPG/PNG/PDF via Supabase Storage.
- [Transações: Rateio UX](mem://features/transacoes/ux-rateio-proporcional) — Rateio em % ou R$ com validação visual do total alocado.
- [Transações: Import/Export CSV](mem://features/transacoes/import-export-csv) — Importação de CSV com mapeamento de colunas e backup total.
- [Transações: Visibilidade DRE x Caixa](mem://features/transacoes/visibilidade-dre-caixa) — Flags affects_dre/affects_cashflow + atalho Venda no cartão (bruto/líquido vinculados).
- [Contas a Pagar/Receber: Vencimentos](mem://features/contas-pagar-receber/gestao-vencimentos) — Cards de resumo e badges cronológicos.
- [Contas a Pagar/Receber: Baixa](mem://features/contas-pagar-receber/baixa-assistida) — Exibição de PIX/banco e envio de comprovante na baixa.
- [Contas a Pagar/Receber: Criação](mem://features/contas-pagar-receber/criacao-direta) — Pré-configuração automática de tipo e status pendente.
- [Dashboard](mem://features/dashboard/indicadores-e-graficos) — KPIs (Saldo, Receitas, Atrasos) e gráficos filtráveis com banners de alerta.
- [Relatórios: Visão Geral](mem://features/relatorios) — DRE e Fluxo de Caixa com filtros (Caixa/Competência) e gráficos Recharts.
- [Relatórios: Estrutura DRE/DFC](mem://features/relatorios/estrutura-dre-dfc) — 161 linhas e 8 grupos, subtotais calculados via sinal aritmético.
- [Relatórios: Rateio](mem://features/relatorios/calculo-rateio) — Lógica de agregação de transações baseada em allocation para DRE/DFC.
- [Relatórios: DRE Comparativo](mem://features/relatorios/dre-comparativo) — Visão lado a lado por unidade, colunas 'Sem unidade' e 'Consolidado'.
- [Relatórios: Itens Sem Unidade](mem://features/relatorios/tratamento-itens-sem-unidade) — Filtro e alerta visual de transações não categorizadas.
- [Exportação: PDF](mem://features/exportacao-pdf) — Geração de alta fidelidade via html2canvas e jspdf.
- [Exportação: CSV](mem://features/relatorios/exportacao-csv) — UTF-8 com BOM para garantir compatibilidade no Excel.
- [Orçamento (Budgets)](mem://features/orcamento) — Planejamento anual por linha do DRE, integrado ao DRE como Orçado vs Realizado + Análise Vertical/Horizontal.
- [Fluxo Projetado](mem://features/fluxo-projetado) — Tabs Realizado/Projetado/Comparativo no Fluxo de Caixa.
