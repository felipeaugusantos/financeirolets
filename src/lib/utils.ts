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
