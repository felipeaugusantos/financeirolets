# Checklist de Conferência / Divergências na Reconciliação

## Objetivo
Transformar a tela de Reconciliação em algo acionável: além de mostrar "por que difere", listar **o que conferir** com status (ok / atenção / erro) e atalhos para investigar cada item.

## Onde
- `src/hooks/useReconciliation.ts` — adicionar derivação dos checks (sem nova query).
- `src/components/reports/ReconciliationReport.tsx` — novo card "Checklist de conferência" entre o "Resumo em uma frase" e os cards de regras.
- (Opcional) link de "Ver no Transações" usando filtros via querystring se a página já suportar.

## Checks propostos
Cada check vira um item com status, título, frase explicativa, valor agregado e — quando aplicável — botão "Ver lançamentos" que abre o `DetailPanel` reutilizado das pontes.

| # | Check | Severidade | Regra |
|---|------|-----------|-------|
| 1 | Identidade Competência fecha | error se quebra | `dashboard + provisionado == dreCompetenciaFull` (tolerância 0,01) |
| 2 | Identidade Caixa fecha | error se quebra | `dashboard + pagoDePeriodoAnterior − pagoForaDaCompetencia == dreCaixa` |
| 3 | Provisionado vencido | warn se há `pendente/agendado` com `due_date < hoje` no período | usa `details.provisionado.items` filtrando por `due_date` (precisa expor `due_date` no `TxDetail`) |
| 4 | Pagos fora da competência | warn se `count > 0` | já calculado |
| 5 | Pagos de período anterior entrando agora | info se `count > 0` | já calculado |
| 6 | Lançamentos sem categoria | warn se houver | `category_name === 'Sem categoria'` em qualquer bucket + agregar nas pontes principais |
| 7 | Lançamentos sem frente | info se houver | `front_name === 'Sem frente'` |
| 8 | Lançamentos sem unidade | warn se houver | precisa expor `unit_id` no `TxDetail` ou contar no hook |
| 9 | Valor líquido negativo / zero em receita ou despesa | warn | `amount <= 0` |
| 10 | Provisionado > Realizado | info se `provisionado > dashboard` em receita ou despesa | comparação de totais |

## Mudanças técnicas

### `useReconciliation.ts`
- Incluir `due_date` e `unit_id` em `TxDetail` (selecionar campos extras no select já existente).
- Adicionar struct `ChecklistItem`:
  ```ts
  type Severity = 'ok' | 'info' | 'warn' | 'error';
  interface ChecklistItem {
    id: string;
    severity: Severity;
    title: string;
    message: string;
    count?: number;
    amount?: number;
    bucketKey?: BucketKey;       // se quisermos abrir DetailPanel
    side?: 'receita' | 'despesa';
  }
  ```
- Função pura `buildChecklist(rec: SideData, des: SideData, today: string): ChecklistItem[]` chamada ao final do `generate`.
- Expor `checklist: ChecklistItem[]` no `ReconciliationData`.

### `ReconciliationReport.tsx`
- Novo componente `Checklist({ items, data })`:
  - Card com título "Checklist de conferência" + badge resumo (ex.: `2 atenção • 1 erro`).
  - Lista de linhas com ícone (`CheckCircle2`, `Info`, `AlertTriangle`, `XCircle` do lucide), título, mensagem e valor formatado.
  - Borda lateral colorida por severidade usando tokens (`border-success`, `border-primary`, `border-warning`/`border-amber-500`, `border-destructive`).
  - Linha expansível quando há `bucketKey + side` → reaproveita `DetailPanel` existente.
  - Filtro topo: "Mostrar só itens com atenção" (toggle).
- Inserir card entre "Resumo em uma frase" e a grade de `RulesBreakdown`.

### Tokens / estilo
- Reaproveitar tokens semânticos (`bg-success/5`, `bg-destructive/5`, `bg-amber-500/5` ou `bg-warning/5` se existir). Verificar `index.css` antes de introduzir cor nova.
- Mobile-first: linhas em coluna no mobile, grid 2 colunas (status + conteúdo) no desktop.

## Fora de escopo
- Persistir resolução dos itens ("marquei como verificado") — pode virar outro pedido.
- Notificações ou tasks automáticas.
- Alterações nos cálculos de DRE/Dashboard.
- Exportação do checklist em PDF (fácil de adicionar depois, junto com o restante da reconciliação).
