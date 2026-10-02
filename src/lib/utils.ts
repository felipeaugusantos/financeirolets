import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Parse a date string like "2026-04-01" without timezone shift.
 *  Appends T12:00:00 so the date stays correct in any timezone. */
export function parseDateUTC(dateStr: string): Date {
  if (!dateStr) return new Date();
  return new Date(dateStr + 'T12:00:00');
}

/** Format a Date using its local calendar components (no UTC shift) → "yyyy-MM-dd". */
export function toLocalISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Current date in America/Sao_Paulo as "yyyy-MM-dd". */
export function todayLocalISO(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

/** Mensagem de qualquer valor lançado (inclui o PostgrestError do Supabase, que não é instância de Error). */
export function errorMessage(e: unknown): string {
  if (typeof e === 'object' && e !== null && 'message' in e) return String((e as { message: unknown }).message);
  return String(e);
}
