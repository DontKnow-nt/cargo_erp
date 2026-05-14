import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Truncate a party name to first ~9 characters before a space */
export function shortName(name: string, maxChars = 9): string {
  if (name.length <= maxChars) return name;
  const cut = name.slice(0, maxChars);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > 3 ? cut.slice(0, lastSpace) : cut) + '…';
}

/** Format a YYYY-MM-DD date string to DD/MM/YYYY for display and CSV export */
export function fmtDate(dateStr: string): string {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-');
  if (!y || !m || !d) return dateStr;
  return `${d}/${m}/${y}`;
}

