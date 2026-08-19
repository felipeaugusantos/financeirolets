---
name: Invariantes financeiras
description: Regras que sempre valem entre Dashboard, DRE, DRE Comparativo e Fluxo de Caixa (rateio residual, filtros unidade x frente, fora do DRE).
type: feature
---
- `splitByUnit` joga o resíduo de rateio incompleto em "Sem unidade": consolidado sempre = valor original, e DRE = Consolidado do DRE Comparativo.
- `valueForFilters(tx, allocMap, unitFilter, frontFilter)` é a única regra para unidade × frente: interseção real das linhas de rateio (nunca `Math.min`). Dashboard usa em KPIs, saldo e alertas.
- Nunca filtrar `.eq('unit_id')`/`.eq('front_id')` direto na query quando o número deve respeitar rateio.
- DRE mostra bloco vermelho "fora do DRE" para lançamentos sem categoria ou com categoria sem `dre_line_id` — nunca descartar em silêncio.
- Testes de invariante em `src/test/invariants.test.ts`; se uma regra falhar, corrigir o código, nunca o teste.
