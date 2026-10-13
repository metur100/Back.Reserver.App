import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Short random id (not security relevant). */
export function uniqueId(prefix = 'id') {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}
