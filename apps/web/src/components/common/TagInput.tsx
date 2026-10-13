import { X } from 'lucide-react';
import { useState } from 'react';
import { t } from '@/i18n';
import { cn } from '@/lib/utils';

interface TagInputProps {
  id: string;
  value: string[];
  onChange: (value: string[]) => void;
  max?: number;
  maxLength?: number;
  placeholder?: string;
  invalid?: boolean;
  describedBy?: string;
}

/** Free-text tags: Enter or comma adds, Backspace on empty input removes the last tag. */
export function TagInput({ id, value, onChange, max = 10, maxLength = 40, placeholder, invalid, describedBy }: TagInputProps) {
  const [draft, setDraft] = useState('');
  const add = (raw: string) => {
    const tag = raw.trim().replace(/,$/, '').slice(0, maxLength);
    if (!tag || value.includes(tag) || value.length >= max) return;
    onChange([...value, tag]);
    setDraft('');
  };
  return (
    <div
      className={cn(
        'flex min-h-11 flex-wrap items-center gap-1.5 rounded-md border border-input bg-surface px-2 py-1.5 focus-within:outline-3 focus-within:outline-offset-1 focus-within:outline-ring',
        invalid && 'border-danger',
      )}
    >
      <ul className="contents">
        {value.map((tag) => (
          <li key={tag} className="inline-flex items-center gap-1 rounded-full bg-success-soft py-0.5 pr-1 pl-2.5 text-sm text-success-strong">
            {tag}
            <button
              type="button"
              className="inline-flex size-6 items-center justify-center rounded-full hover:bg-success/15"
              onClick={() => onChange(value.filter((v) => v !== tag))}
              aria-label={t('admin.products.labelRemove', { label: tag })}
            >
              <X className="size-3.5" aria-hidden="true" />
            </button>
          </li>
        ))}
      </ul>
      <input
        id={id}
        value={draft}
        onChange={(e) => {
          if (e.target.value.endsWith(',')) add(e.target.value);
          else setDraft(e.target.value);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            add(draft);
          } else if (e.key === 'Backspace' && !draft && value.length) {
            onChange(value.slice(0, -1));
          }
        }}
        onBlur={() => draft && add(draft)}
        placeholder={value.length >= max ? '' : placeholder}
        disabled={value.length >= max}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        className="min-w-32 flex-1 bg-transparent px-1 py-1 text-base outline-none sm:text-[0.95rem]"
      />
    </div>
  );
}
