

# Roadmap Completo — Próximas Evoluções do Let's Finance

Já entregue: Onda 1 (RBAC, Auditoria, Recorrência, Baixa em Lote) + segurança zerada.
Abaixo, o caminho recomendado para evoluir de "ERP funcional" para "ERP de gestão inteligente".

---

## Diagnóstico rápido por módulo

| Módulo | Estado | Maior lacuna |
|---|---|---|
| Dashboard | KPIs e gráficos básicos | Sem drill-down, sem comparativo MoM/YoY, sem projeção |
| Lançamentos | CRUD + rateio + recorrência | Sem aprovação, sem conciliação, sem lançamento rápido |
| Contas P/R | Vencimentos + baixa lote | Sem lembretes automáticos, sem agendamento bancário |
| Relatórios | DRE, DRE Comparativo, Fluxo Caixa | Sem Orçado vs Realizado, sem AV/AH, sem Fluxo Projetado |
| Comissões | Estrutura definida (memory) | Cálculo automático ainda não implementado |
| Notificações | Inexistente | Sem sino, sem alertas de vencimento |
| Auditoria | Tela com filtros e diff | Sem export CSV, sem paginação real |

---

## ONDA 2 — Inteligência Financeira (recomendada agora)

### 2.1 Orçamento (Budget) vs Realizado
- Tabela `budgets (year, month, dre_line_id, unit_id, planned_amount)`.
- Tela `/configuracoes/orcamento`: grid editável linhas DRE × meses, botão "copiar ano anterior +X%".
- DRE ganha colunas **Orçado | Realizado | Variação % | Status** (verde/vermelho).
- **Correlação:** reutiliza `dre_lines` + `units` — zero impacto em rateios/exportações.

### 2.2 Fluxo de Caixa Projetado
- Estende `useCashFlowReport` para incluir `pendente`/`agendado` além de `pago`.
- Tabs no relatório: **Realizado | Projetado | Comparativo**.
- Gráfico de linha de saldo futuro baseado em `due_date` + recorrências geradas.

### 2.3 Análise Vertical e Horizontal no DRE
- **AV:** % de cada linha sobre receita líquida.
- **AH:** variação % período-a-período.
- Toggles `[ ] AV` `[ ] AH` no DRE; PDF/CSV incorporam colunas automaticamente.

### 2.4 Conciliação Bancária
- Coluna `reconciled` em `transactions` + tela de upload OFX/CSV de extrato.
- Match automático (valor + data ±2 dias) e fila manual para o restante.
- KPI "% conciliado por conta" no Dashboard.

---

## ONDA 3 — Automação e UX

- **3.1 Cron diário** para `generate_recurring_transactions()` (pg_cron) — elimina o botão manual.
- **3.2 Workflow de Aprovação** — novo status `aguardando_aprovacao`, fila para Financeiro/Admin.
- **3.3 Sino de Notificações** — tabela `notifications` + edge function diária (vencimentos, aprovações, recorrências) + realtime.
- **3.4 Dashboard Drill-down** — KPIs/barras clicáveis abrem lista filtrada; toggles "vs mês anterior" e "vs mesmo mês ano anterior".
- **3.5 Filtros Salvos** — visões pessoais por usuário em Lançamentos e Relatórios.

---

## ONDA 4 — Estratégico

- Comissões automatizadas (cálculo no fechamento → despesa vinculada).
- Balanço Patrimonial.
- Builder visual de relatórios (já existe `report_templates`, falta UI).
- PWA push + instalação no iPhone.
- API/Webhooks para integração com PDV e contabilidade.

---

## Mapa de Correlações

````text
                ┌─────────────────┐
                │  transactions   │ ← núcleo
                └────────┬────────┘
     ┌──────────┬────────┼────────┬──────────────┐
     ▼          ▼        ▼        ▼              ▼
allocations category recurrence approval    reconciled
     │          │        │        │              │
     ▼          ▼        ▼        ▼              ▼
DRE/Fluxo   dre_lines  cron   workflow      extrato
por unidade    │
               ▼
           budgets ──► DRE Orçado vs Realizado
               │
               ▼
       Análise Vertical/Horizontal
````

Toda nova feature reutiliza chaves existentes (`category_id`, `unit_id`, `dre_line_id`) — relatórios, exportações e rateios continuam íntegros.

---

## Sequência sugerida (maior valor primeiro)

1. **2.1 Orçamento vs Realizado** — base para análise de gestão.
2. **2.2 Fluxo Projetado** — antecipa gargalos de caixa.
3. **2.3 AV/AH no DRE** — análise gerencial profunda.
4. **3.1 Cron** — quick win, fecha recorrência.
5. **3.3 Notificações** — engajamento diário.
6. **2.4 Conciliação** — fecha o ciclo financeiro.

---

## Pergunta para destravar

Quer que eu execute a **Onda 2 inteira** (4 entregas) ou prefere começar só por **2.1 Orçamento + 2.2 Fluxo Projetado**, que entregam ~80% do valor de gestão com menos superfície?

