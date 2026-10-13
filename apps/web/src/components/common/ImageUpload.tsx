import { ImagePlus, Trash2 } from 'lucide-react';
import { useId, useRef, useState } from 'react';
import { mediaUrl } from '@/api/client';
import { adminApi } from '@/api/endpoints';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/toast';
import { t } from '@/i18n';
import { cn } from '@/lib/utils';

const MAX_BYTES = 5 * 1024 * 1024;
const TYPES = ['image/jpeg', 'image/png', 'image/webp'];

/** Validates a file before upload (the server re-checks content type and size). Returns an error message or null. */
export function validateImageFile(file: File): string | null {
  if (!TYPES.includes(file.type)) return t('admin.products.imageType');
  if (file.size > MAX_BYTES) return t('admin.products.imageTooLarge');
  return null;
}

interface ImageUploadProps {
  value: string;
  onChange: (url: string) => void;
  label: string;
  aspect?: 'square' | 'wide' | 'photo';
  disabled?: boolean;
}

/** Upload via POST /admin/uploads/images with preview; stores the returned relative URL. */
export function ImageUpload({ value, onChange, label, aspect = 'photo', disabled }: ImageUploadProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const preview = mediaUrl(value);

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    const problem = validateImageFile(file);
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);
    setUploading(true);
    try {
      const res = await adminApi.uploadImage(file);
      onChange(res.url);
    } catch (e) {
      toast.fromError(e);
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <div
        className={cn(
          'flex shrink-0 items-center justify-center overflow-hidden rounded-lg border border-dashed border-border-strong bg-surface-muted',
          aspect === 'square' ? 'size-24' : aspect === 'wide' ? 'h-24 w-48' : 'h-24 w-32',
        )}
      >
        {preview ? <img src={preview} alt={label} className="size-full object-cover" /> : <ImagePlus className="size-7 text-subtle-foreground" aria-hidden="true" />}
      </div>
      <div className="space-y-1.5">
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          accept={TYPES.join(',')}
          className="sr-only"
          onChange={(e) => void onFile(e.target.files?.[0])}
          disabled={disabled || uploading}
          aria-label={`${label}: ${t('admin.products.imageUpload')}`}
        />
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" loading={uploading} disabled={disabled} onClick={() => inputRef.current?.click()}>
            <ImagePlus aria-hidden="true" />
            {uploading ? t('admin.products.uploading') : t('admin.products.imageUpload')}
          </Button>
          {value && (
            <Button variant="ghost" onClick={() => onChange('')} disabled={disabled || uploading}>
              <Trash2 aria-hidden="true" />
              {t('admin.products.imageRemove')}
            </Button>
          )}
        </div>
        <p className={cn('text-sm', error ? 'font-medium text-danger' : 'text-muted-foreground')} role={error ? 'alert' : undefined}>
          {error ?? t('admin.products.imageHint')}
        </p>
      </div>
    </div>
  );
}
