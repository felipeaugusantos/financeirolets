export interface ProposalLine { name: string; packages: number; unitPrice: number }
const c2 = (v: number) => Math.round(v * 100) / 100;

/** Subtotal, desconto em % (0–100) e total da proposta. */
export function proposalTotals(lines: ProposalLine[], discountPct: number) {
  const subtotal = c2(lines.reduce((s, l) => s + c2(Math.max(0, l.packages) * Math.max(0, l.unitPrice)), 0));
  const pct = Math.min(100, Math.max(0, discountPct || 0));
  const discount = c2(subtotal * pct / 100);
  return { subtotal, discount, total: c2(subtotal - discount) };
}

export function proposalValidUntil(issueIso: string, days: number) {
  const d = new Date(`${issueIso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + Math.max(0, days));
  return d.toISOString().slice(0, 10);
}

/** Proposta por pessoa: uma única linha = participantes × preço por pessoa (sem frações de pessoa). */
export function perPersonLine(label: string, attendees: number, pricePerPerson: number): ProposalLine {
  return {
    name: `${label.trim() || 'Coffee break'} (por pessoa)`,
    packages: Math.max(0, Math.floor(attendees || 0)),
    unitPrice: Math.max(0, pricePerPerson || 0),
  };
}
