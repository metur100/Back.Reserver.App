import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Settings2 } from 'lucide-react';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { errorMessage } from '@/api/client';
import { adminApi } from '@/api/endpoints';
import type { CategoryDto, ProductDto } from '@/api/types';
import { ImageUpload } from '@/components/common/ImageUpload';
import { TagInput } from '@/components/common/TagInput';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field, fieldAria, Input, NativeSelect, Textarea } from '@/components/ui/input';
import { Alert } from '@/components/ui/surface';
import { toast } from '@/components/ui/toast';
import { t } from '@/i18n';
import { applyServerErrors } from '@/lib/formErrors';
import { useAdmin } from '../AdminContext';
import { emptyProductForm, formToUpsert, productFormSchema, productToForm, type ProductFormValues } from './productSchema';

const fields: (keyof ProductFormValues)[] = [
  'name',
  'description',
  'categoryId',
  'price',
  'imageUrl',
  'allergens',
  'ingredients',
  'dietaryLabels',
  'leadTimeHours',
  'defaultDailyQuantity',
  'sortOrder',
];

interface ProductFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product: ProductDto | null;
  categories: CategoryDto[];
  onManageCategories: () => void;
}

export function ProductFormDialog({ open, onOpenChange, product, categories, onManageCategories }: ProductFormDialogProps) {
  const { key } = useAdmin();
  const queryClient = useQueryClient();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    control,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<ProductFormValues>({ resolver: zodResolver(productFormSchema), defaultValues: product ? productToForm(product) : emptyProductForm });

  const save = useMutation({
    mutationFn: (values: ProductFormValues) => (product ? adminApi.updateProduct(product.id, formToUpsert(values)) : adminApi.createProduct(formToUpsert(values))),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: key('products') });
      void queryClient.invalidateQueries({ queryKey: key('categories') });
      void queryClient.invalidateQueries({ queryKey: key('inventory') });
      toast.success(product ? t('admin.products.updated') : t('admin.products.created'));
      onOpenChange(false);
    },
    onError: (error) => {
      const mapped = applyServerErrors(error, setError, fields, (k) => (k === 'basePrice' ? 'price' : k));
      if (!mapped) setFormError(errorMessage(error));
    },
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !isSubmitting && onOpenChange(v)}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>{product ? t('admin.products.edit') : t('admin.products.new')}</DialogTitle>
          <DialogDescription>{t('admin.products.publicHint')}</DialogDescription>
        </DialogHeader>
        <form noValidate onSubmit={handleSubmit((v) => save.mutateAsync(v).catch(() => undefined))} className="space-y-4">
          {formError && (
            <Alert tone="danger" live>
              {formError}
            </Alert>
          )}
          <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_10rem]">
            <Field id="p-name" label={t('admin.products.name')} required error={errors.name?.message}>
              <Input {...fieldAria('p-name', errors.name?.message)} {...register('name')} />
            </Field>
            <Field id="p-price" label={`${t('admin.products.price')} (€)`} required hint={t('admin.products.priceHint')} error={errors.price?.message}>
              <Input {...fieldAria('p-price', errors.price?.message, true)} inputMode="decimal" placeholder="2,50" {...register('price')} />
            </Field>
          </div>
          <Field id="p-description" label={t('admin.products.description')} optional error={errors.description?.message}>
            <Textarea {...fieldAria('p-description', errors.description?.message)} rows={2} {...register('description')} />
          </Field>
          <Field id="p-category" label={t('admin.products.category')} error={errors.categoryId?.message}>
            <div className="flex gap-2">
              <NativeSelect {...fieldAria('p-category', errors.categoryId?.message)} {...register('categoryId')}>
                <option value="">{t('admin.products.noCategory')}</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </NativeSelect>
              <Button variant="outline" size="icon" onClick={onManageCategories} aria-label={t('admin.products.manageCategories')}>
                <Settings2 aria-hidden="true" />
              </Button>
            </div>
          </Field>
          <Controller
            control={control}
            name="imageUrl"
            render={({ field }) => (
              <div className="space-y-2">
                <span className="text-sm font-medium">{t('admin.products.image')}</span>
                <ImageUpload value={field.value} onChange={field.onChange} label={t('admin.products.image')} />
                <Field id="p-image-url" label={t('admin.products.imageUrl')} labelClassName="font-normal text-muted-foreground" error={errors.imageUrl?.message}>
                  <Input {...fieldAria('p-image-url', errors.imageUrl?.message)} value={field.value} onChange={(e) => field.onChange(e.target.value)} placeholder="https://…" />
                </Field>
              </div>
            )}
          />
          <Field id="p-allergens" label={t('admin.products.allergens')} hint={t('admin.products.allergensHint')} error={errors.allergens?.message}>
            <Textarea {...fieldAria('p-allergens', errors.allergens?.message, true)} rows={2} {...register('allergens')} />
          </Field>
          <Field id="p-ingredients" label={t('admin.products.ingredients')} optional error={errors.ingredients?.message}>
            <Textarea {...fieldAria('p-ingredients', errors.ingredients?.message)} rows={2} {...register('ingredients')} />
          </Field>
          <Controller
            control={control}
            name="dietaryLabels"
            render={({ field }) => (
              <Field id="p-labels" label={t('admin.products.labels')} hint={t('admin.products.labelsHint')} error={errors.dietaryLabels?.message}>
                <TagInput
                  id="p-labels"
                  value={field.value}
                  onChange={field.onChange}
                  placeholder={t('admin.products.labelsAdd')}
                  invalid={!!errors.dietaryLabels}
                  describedBy={errors.dietaryLabels ? 'p-labels-error' : 'p-labels-hint'}
                />
              </Field>
            )}
          />
          <div className="grid gap-4 sm:grid-cols-3">
            <Field id="p-lead" label={t('admin.products.leadTime')} hint={t('admin.products.leadTimeHint')} error={errors.leadTimeHours?.message}>
              <Input {...fieldAria('p-lead', errors.leadTimeHours?.message, true)} type="number" inputMode="numeric" min={0} max={720} {...register('leadTimeHours')} />
            </Field>
            <Field id="p-default" label={t('admin.products.defaultQty')} hint={t('admin.products.defaultQtyHint')} error={errors.defaultDailyQuantity?.message}>
              <Input {...fieldAria('p-default', errors.defaultDailyQuantity?.message, true)} type="number" inputMode="numeric" min={0} {...register('defaultDailyQuantity')} />
            </Field>
            <Field id="p-sort" label={t('admin.products.sortOrder')} hint={t('admin.products.sortOrderHint')} error={errors.sortOrder?.message}>
              <Input {...fieldAria('p-sort', errors.sortOrder?.message, true)} type="number" inputMode="numeric" {...register('sortOrder')} />
            </Field>
          </div>
          <DialogFooter>
            <Button variant="outline" size="lg" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
              {t('app.cancel')}
            </Button>
            <Button type="submit" size="lg" loading={isSubmitting}>
              {t('app.save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
