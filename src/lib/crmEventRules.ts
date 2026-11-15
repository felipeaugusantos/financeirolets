export const EVENT_STATUSES = [
  { value: 'planejado', label: 'Planejado' },
  { value: 'confirmado', label: 'Confirmado' },
  { value: 'realizado', label: 'Realizado' },
  { value: 'cancelado', label: 'Cancelado' },
];

export function validateEvent(event: { title: string; event_date: string; location: string; status: string }) {
  if (!event.title.trim()) return 'Informe o nome do evento';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(event.event_date) || Number.isNaN(Date.parse(event.event_date)) || new Date(event.event_date).toISOString().slice(0, 10) !== event.event_date) return 'Informe uma data válida';
  if (!event.location.trim()) return 'Informe o local';
  if (!EVENT_STATUSES.some(s => s.value === event.status)) return 'Selecione o status';
  return null;
}

export function canLinkEvent(event: { company_id: string; active: boolean }, companyId: string) {
  return event.active && event.company_id === companyId;
}