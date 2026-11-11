const normUnit = (s: string) =>
  s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/let'?s\s*/g, '').replace(/\s+/g, ' ').trim();

/** "Café/Boulevard/Fábrica", "Café, Boulevard e Fábrica" → ["Café","Boulevard","Fábrica"] */
export function splitUnitNames(raw: string): string[] {
  return raw.split(/\s*(?:\/|,|;|\+|\||\s+e\s+)\s*/i).map(s => s.trim()).filter(Boolean);
}

/** Casa o nome digitado com a unidade: exato primeiro, depois o nome mais curto que contém o texto. */
export function resolveUnit(name: string, units: { id: string; name: string }[]): string | null {
  const n = normUnit(name);
  if (!n) return null;
  const exact = units.find(u => normUnit(u.name) === n);
  if (exact) return exact.id;
  const partial = units.filter(u => normUnit(u.name).includes(n)).sort((a, b) => a.name.length - b.name.length);
  return partial[0]?.id ?? null;
}
