type Opp = { event_id: string | null; estimated_value: number; stage: string; active: boolean };
/** Soma das propostas por evento: só oportunidades ativas e não perdidas. Apenas estimativa comercial, nunca financeiro. */
export function proposalTotalsByEvent(opps: Opp[]) {
  const m: Record<string, { total: number; won: number; count: number }> = {};
  for (const o of opps) {
    if (!o.event_id || !o.active || o.stage === 'perdida') continue;
    const r = (m[o.event_id] ??= { total: 0, won: 0, count: 0 });
    const v = Number(o.estimated_value) || 0;
    r.total = Math.round((r.total + v) * 100) / 100; r.count++;
    if (o.stage === 'ganha') r.won = Math.round((r.won + v) * 100) / 100;
  }
  return m;
}
