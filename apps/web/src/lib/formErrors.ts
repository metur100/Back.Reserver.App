import type { FieldValues, Path, UseFormSetError } from 'react-hook-form';
import { isApiError } from '@/api/client';

/**
 * Maps RFC 7807 validation errors (keyed by camelCase field path) onto react-hook-form fields.
 * Returns true when at least one field error was applied.
 */
export function applyServerErrors<T extends FieldValues>(
  error: unknown,
  setError: UseFormSetError<T>,
  fields: readonly Path<T>[],
  map: (serverKey: string) => string = (k) => k,
): boolean {
  if (!isApiError(error) || !error.errors) return false;
  let applied = false;
  for (const [key, messages] of Object.entries(error.errors)) {
    const target = map(key);
    const field = fields.find((f) => f.toLowerCase() === target.toLowerCase());
    if (field && messages[0]) {
      setError(field, { type: 'server', message: messages[0] });
      applied = true;
    }
  }
  return applied;
}
