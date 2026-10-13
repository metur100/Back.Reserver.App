import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Archive, ArchiveRestore, Copy, Eye, EyeOff, ImageOff, MoreVertical, Pencil, Plus, Search, Settings2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { mediaUrl } from '@/api/client';
import { adminApi } from '@/api/endpoints';
import type { ProductDto, ProductStatusFilter } from '@/api/types';
import { EmptyState, ErrorState, ListSkeleton, PageHeader, Pagination } from '@/components/common/states';
import { ConfirmDialog } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/controls';
import { Input, Label } from '@/components/ui/input';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/menu';
import { Badge, Card } from '@/components/ui/surface';
import { toast } from '@/components/ui/toast';
import { t } from '@/i18n';
import { formatMoney } from '@/lib/money';
import { useDocumentTitle } from '@/lib/useDocumentTitle';
import { useAdmin } from '../AdminContext';
import { CategoriesDialog } from './CategoriesDialog';
import { ProductFormDialog } from './ProductFormDialog';

type StatusFilter = ProductStatusFilter | 'active';

export function ProductStatusBadge({ product }: { product: ProductDto }) {
  if (product.isArchived)
    return (
      <Badge tone="neutral">
        <Archive aria-hidden="true" />
        {t('admin.products.statusArchived')}
      </Badge>
    );
  if (product.isPublished)
    return (
      <Badge tone="success">
        <Eye aria-hidden="true" />
        {t('admin.products.statusPublished')}
      </Badge>
    );
  return (
    <Badge tone="warning">
      <EyeOff aria-hidden="true" />
      {t('admin.products.statusDraft')}
    </Badge>
  );
}

export default function ProductsPage() {
  useDocumentTitle(t('admin.products.title'));
  const { key } = useAdmin();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [categoryId, setCategoryId] = useState('all');
  const [status, setStatus] = useState<StatusFilter>('active');
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<ProductDto | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [categoriesOpen, setCategoriesOpen] = useState(false);

  useEffect(() => {
    const id = window.setTimeout(() => {
      setDebounced(search.trim());
      setPage(1);
    }, 300);
    return () => window.clearTimeout(id);
  }, [search]);

  const query = {
    categoryId: categoryId === 'all' ? undefined : categoryId,
    status: status === 'active' ? undefined : status,
    search: debounced || undefined,
    page,
    pageSize: 50,
  };
  const productsQ = useQuery({ queryKey: key('products', query), queryFn: () => adminApi.products(query), placeholderData: keepPreviousData });
  const categoriesQ = useQuery({ queryKey: key('categories'), queryFn: adminApi.categories });
  const categories = categoriesQ.data ?? [];

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: key('products') });
    void queryClient.invalidateQueries({ queryKey: key('categories') });
    void queryClient.invalidateQueries({ queryKey: key('inventory') });
  };

  const action = useMutation({
    mutationFn: async ({ product, kind }: { product: ProductDto; kind: 'publish' | 'unpublish' | 'archive' | 'restore' | 'copy' }) => {
      switch (kind) {
        case 'publish': {
          const r = await adminApi.publishProduct(product.id);
          return { message: r.message ?? t('admin.products.published', { name: product.name }) };
        }
        case 'unpublish': {
          const r = await adminApi.unpublishProduct(product.id);
          return { message: r.message ?? t('admin.products.unpublished', { name: product.name }), warn: !!r.message };
        }
        case 'archive':
          await adminApi.archiveProduct(product.id);
          return { message: t('admin.products.archived', { name: product.name }) };
        case 'restore':
          await adminApi.restoreProduct(product.id);
          return { message: t('admin.products.restored', { name: product.name }) };
        case 'copy': {
          const copy = await adminApi.copyProduct(product.id);
          return { message: t('admin.products.copied', { name: copy.name }) };
        }
      }
    },
    onSuccess: (r) => {
      invalidate();
      if (r.warn) toast.warning(r.message);
      else toast.success(r.message);
    },
    onError: (e) => toast.fromError(e),
  });

  const openForm = (product: ProductDto | null) => {
    setEditing(product);
    setFormOpen(true);
  };

  const data = productsQ.data;
  const filtered = !!debounced || categoryId !== 'all' || status !== 'active';

  return (
    <div>
      <PageHeader
        title={t('admin.products.title')}
        description={t('admin.products.publicHint')}
        actions={
          <>
            <Button variant="outline" onClick={() => setCategoriesOpen(true)}>
              <Settings2 aria-hidden="true" />
              {t('admin.products.manageCategories')}
            </Button>
            <Button onClick={() => openForm(null)}>
              <Plus aria-hidden="true" />
              {t('admin.products.new')}
            </Button>
          </>
        }
      />

      <Card className="mb-4 grid gap-3 p-4 sm:grid-cols-[minmax(0,1fr)_14rem_14rem]">
        <div className="space-y-1.5">
          <Label htmlFor="product-search">{t('app.search')}</Label>
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input id="product-search" type="search" className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('admin.products.searchPlaceholder')} />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="product-category">{t('admin.products.category')}</Label>
          <Select
            value={categoryId}
            onValueChange={(v) => {
              setCategoryId(v);
              setPage(1);
            }}
          >
            <SelectTrigger id="product-category">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('admin.products.allCategories')}</SelectItem>
              {categories.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="product-status">{t('admin.products.status')}</Label>
          <Select
            value={status}
            onValueChange={(v) => {
              setStatus(v as StatusFilter);
              setPage(1);
            }}
          >
            <SelectTrigger id="product-status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="active">{t('admin.products.statusActive')}</SelectItem>
              <SelectItem value="published">{t('admin.products.statusPublished')}</SelectItem>
              <SelectItem value="draft">{t('admin.products.statusDraft')}</SelectItem>
              <SelectItem value="archived">{t('admin.products.statusArchived')}</SelectItem>
              <SelectItem value="all">{t('admin.products.statusAll')}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </Card>

      {productsQ.isPending ? (
        <ListSkeleton rows={5} />
      ) : productsQ.isError ? (
        <ErrorState error={productsQ.error} onRetry={() => void productsQ.refetch()} />
      ) : data!.items.length === 0 ? (
        filtered ? (
          <EmptyState title={t('admin.products.emptyFiltered')} />
        ) : (
          <EmptyState
            title={t('admin.products.empty')}
            description={t('admin.products.emptyHint')}
            action={
              <Button onClick={() => openForm(null)}>
                <Plus aria-hidden="true" />
                {t('admin.products.new')}
              </Button>
            }
          />
        )
      ) : (
        <>
          <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface shadow-soft">
            {data!.items.map((p) => (
              <ProductRow key={p.id} product={p} onEdit={() => openForm(p)} onAction={(kind) => action.mutateAsync({ product: p, kind })} busy={action.isPending && action.variables?.product.id === p.id} />
            ))}
          </ul>
          <Pagination page={data!.page} pageSize={data!.pageSize} total={data!.totalCount} onPage={setPage} />
        </>
      )}

      {formOpen && <ProductFormDialog key={editing?.id ?? 'new'} open={formOpen} onOpenChange={setFormOpen} product={editing} categories={categories} onManageCategories={() => setCategoriesOpen(true)} />}
      <CategoriesDialog open={categoriesOpen} onOpenChange={setCategoriesOpen} categories={categories} />
    </div>
  );
}

function ProductRow({
  product,
  onEdit,
  onAction,
  busy,
}: {
  product: ProductDto;
  onEdit: () => void;
  onAction: (kind: 'publish' | 'unpublish' | 'archive' | 'restore' | 'copy') => Promise<unknown>;
  busy: boolean;
}) {
  const [archiveOpen, setArchiveOpen] = useState(false);
  const image = mediaUrl(product.imageUrl);
  const run = (kind: Parameters<typeof onAction>[0]) => void onAction(kind).catch(() => undefined);
  return (
    <li className="flex flex-wrap items-center gap-3 p-3 sm:flex-nowrap sm:p-4" data-testid="product-row">
      <div className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-surface-muted">
        {image ? <img src={image} alt="" className="size-full object-cover" /> : <ImageOff className="size-5 text-subtle-foreground" aria-hidden="true" />}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold">{product.name}</p>
        <p className="text-sm text-muted-foreground">
          {product.categoryName ?? t('admin.products.noCategory')} · <span className="tabular">{formatMoney(product.basePrice, product.currency)}</span>
          {product.defaultDailyQuantity !== null && ` · ${t('admin.products.defaultQty')}: ${product.defaultDailyQuantity}`}
        </p>
      </div>
      <ProductStatusBadge product={product} />
      <div className="ml-auto flex items-center gap-1">
        {!product.isArchived && !product.isPublished && (
          <Button size="sm" variant="outline" loading={busy} onClick={() => run('publish')} aria-label={`${t('admin.products.publish')}: ${product.name}`}>
            <Eye aria-hidden="true" />
            <span className="hidden md:inline">{t('admin.products.publish')}</span>
          </Button>
        )}
        {!product.isArchived && (
          <Button size="icon-sm" variant="ghost" onClick={onEdit} aria-label={`${t('app.edit')}: ${product.name}`}>
            <Pencil aria-hidden="true" />
          </Button>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="icon-sm" variant="ghost" aria-label={`${t('app.actions')}: ${product.name}`}>
              <MoreVertical aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {!product.isArchived && (
              <DropdownMenuItem onSelect={onEdit}>
                <Pencil aria-hidden="true" />
                {t('app.edit')}
              </DropdownMenuItem>
            )}
            {!product.isArchived &&
              (product.isPublished ? (
                <DropdownMenuItem onSelect={() => run('unpublish')}>
                  <EyeOff aria-hidden="true" />
                  {t('admin.products.unpublish')}
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem onSelect={() => run('publish')}>
                  <Eye aria-hidden="true" />
                  {t('admin.products.publish')}
                </DropdownMenuItem>
              ))}
            <DropdownMenuItem onSelect={() => run('copy')}>
              <Copy aria-hidden="true" />
              {t('admin.products.copy')}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {product.isArchived ? (
              <DropdownMenuItem onSelect={() => run('restore')}>
                <ArchiveRestore aria-hidden="true" />
                {t('admin.products.restore')}
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem destructive onSelect={() => setArchiveOpen(true)}>
                <Archive aria-hidden="true" />
                {t('admin.products.archive')}
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <ConfirmDialog
        open={archiveOpen}
        onOpenChange={setArchiveOpen}
        title={t('admin.products.archiveTitle')}
        description={t('admin.products.archiveText')}
        confirmLabel={t('admin.products.archive')}
        variant="danger"
        onConfirm={() => onAction('archive')}
      />
    </li>
  );
}
