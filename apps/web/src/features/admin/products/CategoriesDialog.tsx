import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Check, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { adminApi } from '@/api/endpoints';
import type { CategoryDto } from '@/api/types';
import { ConfirmDialog } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/controls';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input, Label } from '@/components/ui/input';
import { toast } from '@/components/ui/toast';
import { t } from '@/i18n';
import { useAdmin } from '../AdminContext';

export function CategoriesDialog({ open, onOpenChange, categories }: { open: boolean; onOpenChange: (open: boolean) => void; categories: CategoryDto[] }) {
  const { key } = useAdmin();
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: key('categories') });
    void queryClient.invalidateQueries({ queryKey: key('products') });
  };

  const create = useMutation({
    mutationFn: () => adminApi.createCategory({ name: name.trim(), sortOrder: (categories.at(-1)?.sortOrder ?? 0) + 1, isActive: true }),
    onSuccess: () => {
      setName('');
      invalidate();
      toast.success(t('admin.products.categorySaved'));
    },
    onError: (e) => toast.fromError(e),
  });
  const update = useMutation({
    mutationFn: (c: CategoryDto & { nextName?: string }) =>
      adminApi.updateCategory(c.id, { name: (c.nextName ?? c.name).trim(), sortOrder: c.sortOrder, isActive: c.isActive }),
    onSuccess: () => {
      invalidate();
      toast.success(t('admin.products.categorySaved'));
    },
    onError: (e) => toast.fromError(e),
  });
  const remove = useMutation({
    mutationFn: (id: string) => adminApi.deleteCategory(id),
    onSuccess: () => {
      invalidate();
      toast.success(t('admin.products.categoryDeleted'));
    },
    onError: (e) => toast.fromError(e),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('admin.products.categoriesTitle')}</DialogTitle>
          <DialogDescription>{t('admin.products.manageCategories')}</DialogDescription>
        </DialogHeader>
        <form
          noValidate
          className="flex items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!name.trim()) {
              setError(t('validation.categoryName'));
              return;
            }
            setError(null);
            create.mutate();
          }}
        >
          <div className="flex-1 space-y-1.5">
            <Label htmlFor="new-category">{t('admin.products.categoryNew')}</Label>
            <Input
              id="new-category"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={80}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? 'new-category-error' : undefined}
            />
          </div>
          <Button type="submit" loading={create.isPending}>
            <Plus aria-hidden="true" />
            {t('admin.products.categoryAdd')}
          </Button>
        </form>
        {error && (
          <p id="new-category-error" className="-mt-2 text-sm font-medium text-danger" role="alert">
            {error}
          </p>
        )}
        {categories.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('admin.products.categoriesEmpty')}</p>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border">
            {categories.map((c) => (
              <CategoryRow
                key={c.id}
                category={c}
                onRename={(nextName) => update.mutate({ ...c, nextName })}
                onToggle={(isActive) => update.mutate({ ...c, isActive })}
                onDelete={() => remove.mutateAsync(c.id)}
              />
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}

function CategoryRow({
  category,
  onRename,
  onToggle,
  onDelete,
}: {
  category: CategoryDto;
  onRename: (name: string) => void;
  onToggle: (active: boolean) => void;
  onDelete: () => Promise<unknown>;
}) {
  const [name, setName] = useState(category.name);
  const dirty = name.trim() !== category.name && name.trim().length > 0;
  return (
    <li className="flex flex-wrap items-center gap-2 p-2.5">
      <label className="sr-only" htmlFor={`cat-${category.id}`}>
        {t('admin.products.categoryName')}
      </label>
      <Input id={`cat-${category.id}`} value={name} onChange={(e) => setName(e.target.value)} className="h-10 min-w-0 flex-1" maxLength={80} />
      {dirty && (
        <Button size="icon-sm" onClick={() => onRename(name)} aria-label={t('app.save')}>
          <Check aria-hidden="true" />
        </Button>
      )}
      <span className="text-xs text-muted-foreground">{t('admin.products.categoryProducts', { count: category.productCount })}</span>
      <div className="flex items-center gap-2">
        <Switch id={`cat-active-${category.id}`} checked={category.isActive} onCheckedChange={onToggle} aria-label={`${category.name}: ${t('admin.products.categoryActive')}`} />
      </div>
      <ConfirmDialog
        trigger={
          <Button variant="ghost" size="icon-sm" aria-label={`${t('app.delete')}: ${category.name}`}>
            <Trash2 aria-hidden="true" />
          </Button>
        }
        title={t('admin.products.categoryDeleteTitle')}
        description={category.name}
        confirmLabel={t('app.delete')}
        variant="danger"
        onConfirm={onDelete}
      />
    </li>
  );
}
