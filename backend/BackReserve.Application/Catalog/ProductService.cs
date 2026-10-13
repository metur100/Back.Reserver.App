using BackReserve.Application.Abstractions;
using BackReserve.Application.Common;
using BackReserve.Application.Contracts;
using BackReserve.Application.Subscriptions;
using BackReserve.Domain.Entities;
using BackReserve.Domain.Enums;
using BackReserve.Domain.Rules;
using Microsoft.EntityFrameworkCore;

namespace BackReserve.Application.Catalog;

public sealed class ProductService(
    IAppDbContext db, IAdminContextAccessor admin, SubscriptionGuard guard, IAuditLogger audit, TimeProvider clock)
{
    private AdminContext Ctx => admin.Context;

    // ---------- Categories ----------

    public async Task<IReadOnlyList<CategoryDto>> ListCategoriesAsync(CancellationToken ct)
    {
        Ctx.Require(Permission.OrdersView);
        return await db.ProductCategories.AsNoTracking()
            .Where(c => c.TenantId == Ctx.TenantId)
            .OrderBy(c => c.SortOrder).ThenBy(c => c.Name)
            .Select(c => new CategoryDto(c.Id, c.Name, c.Slug, c.SortOrder, c.IsActive,
                db.Products.Count(p => p.CategoryId == c.Id && !p.IsArchived)))
            .ToListAsync(ct);
    }

    public async Task<CategoryDto> CreateCategoryAsync(UpsertCategoryRequest request, CancellationToken ct)
    {
        Ctx.Require(Permission.ProductsManage);
        var slug = await UniqueCategorySlugAsync(request.Name, null, ct);
        var category = new ProductCategory { TenantId = Ctx.TenantId, Name = request.Name.Trim(), Slug = slug, SortOrder = request.SortOrder, IsActive = request.IsActive };
        db.ProductCategories.Add(category);
        await db.SaveChangesAsync(ct);
        return new CategoryDto(category.Id, category.Name, category.Slug, category.SortOrder, category.IsActive, 0);
    }

    public async Task<CategoryDto> UpdateCategoryAsync(Guid id, UpsertCategoryRequest request, CancellationToken ct)
    {
        Ctx.Require(Permission.ProductsManage);
        var category = await db.ProductCategories.FirstOrDefaultAsync(c => c.Id == id && c.TenantId == Ctx.TenantId, ct)
            ?? throw new NotFoundException("Kategorie nicht gefunden.");
        if (category.Name != request.Name.Trim())
        {
            category.Name = request.Name.Trim();
            category.Slug = await UniqueCategorySlugAsync(category.Name, id, ct);
        }
        category.SortOrder = request.SortOrder;
        category.IsActive = request.IsActive;
        await db.SaveChangesAsync(ct);
        var count = await db.Products.CountAsync(p => p.CategoryId == id && !p.IsArchived, ct);
        return new CategoryDto(category.Id, category.Name, category.Slug, category.SortOrder, category.IsActive, count);
    }

    public async Task DeleteCategoryAsync(Guid id, CancellationToken ct)
    {
        Ctx.Require(Permission.ProductsManage);
        var category = await db.ProductCategories.FirstOrDefaultAsync(c => c.Id == id && c.TenantId == Ctx.TenantId, ct)
            ?? throw new NotFoundException("Kategorie nicht gefunden.");
        if (await db.Products.AnyAsync(p => p.CategoryId == id, ct))
            throw new ConflictException("category_in_use", "Die Kategorie enthält noch Produkte. Ordnen Sie diese zuerst einer anderen Kategorie zu oder deaktivieren Sie die Kategorie.");
        db.ProductCategories.Remove(category);
        await db.SaveChangesAsync(ct);
    }

    private async Task<string> UniqueCategorySlugAsync(string name, Guid? excludeId, CancellationToken ct)
    {
        var baseSlug = Codes.Slugify(name);
        if (baseSlug.Length == 0) baseSlug = "kategorie";
        var slug = baseSlug;
        for (var i = 2; await db.ProductCategories.AnyAsync(c => c.TenantId == Ctx.TenantId && c.Slug == slug && c.Id != excludeId, ct); i++)
            slug = $"{baseSlug}-{i}";
        return slug;
    }

    // ---------- Products ----------

    public async Task<PagedResult<ProductDto>> ListAsync(ProductQuery query, CancellationToken ct)
    {
        Ctx.Require(Permission.OrdersView);
        var q = db.Products.AsNoTracking().Where(p => p.TenantId == Ctx.TenantId);
        if (query.CategoryId is { } categoryId) q = q.Where(p => p.CategoryId == categoryId);
        q = query.Status switch
        {
            "published" => q.Where(p => p.IsPublished && !p.IsArchived),
            "draft" => q.Where(p => !p.IsPublished && !p.IsArchived),
            "archived" => q.Where(p => p.IsArchived),
            "all" => q,
            _ => q.Where(p => !p.IsArchived),
        };
        if (!string.IsNullOrWhiteSpace(query.Search)) q = q.Where(p => p.Name.Contains(query.Search.Trim()));

        var page = new PageQuery(query.Page, query.PageSize);
        var total = await q.CountAsync(ct);
        var rows = await q.OrderBy(p => p.SortOrder).ThenBy(p => p.Name).Skip(page.Skip).Take(page.SafePageSize)
            .Select(p => new { Product = p, CategoryName = p.Category != null ? p.Category.Name : null })
            .ToListAsync(ct);
        return new PagedResult<ProductDto>(rows.Select(r => ToDto(r.Product, r.CategoryName)).ToList(), page.SafePage, page.SafePageSize, total);
    }

    public async Task<ProductDto> GetAsync(Guid id, CancellationToken ct)
    {
        Ctx.Require(Permission.OrdersView);
        var product = await LoadAsync(id, tracked: false, ct);
        return await ToDtoAsync(product, ct);
    }

    public async Task<ProductDto> CreateAsync(UpsertProductRequest request, CancellationToken ct)
    {
        Ctx.Require(Permission.ProductsManage);
        await guard.EnsureCanAddProductAsync(Ctx.TenantId, ct);
        await EnsureCategoryAsync(request.CategoryId, ct);
        var now = clock.GetUtcNow();
        var product = new Product
        {
            TenantId = Ctx.TenantId,
            Slug = await UniqueSlugAsync(request.Name, null, ct),
            Currency = "EUR",
            IsPublished = false,
            CreatedAt = now,
        };
        Apply(product, request, now);
        db.Products.Add(product);
        audit.Log(Ctx.TenantId, Ctx.UserId, "product.created", nameof(Product), product.Id.ToString(), new { product.Name, product.BasePrice });
        await db.SaveChangesAsync(ct);
        return await ToDtoAsync(product, ct);
    }

    public async Task<ProductDto> UpdateAsync(Guid id, UpsertProductRequest request, CancellationToken ct)
    {
        Ctx.Require(Permission.ProductsManage);
        var product = await LoadAsync(id, tracked: true, ct);
        if (product.IsArchived) throw new ConflictException("product_archived", "Archivierte Produkte können nicht bearbeitet werden.");
        await EnsureCategoryAsync(request.CategoryId, ct);
        var oldPrice = product.BasePrice;
        if (product.Name != request.Name.Trim()) product.Slug = await UniqueSlugAsync(request.Name, id, ct);
        Apply(product, request, clock.GetUtcNow());
        if (oldPrice != product.BasePrice)
            audit.Log(Ctx.TenantId, Ctx.UserId, "product.price_changed", nameof(Product), id.ToString(), new { from = oldPrice, to = product.BasePrice });
        await SaveWithConcurrencyAsync(ct);
        return await ToDtoAsync(product, ct);
    }

    public Task<ProductStatusChangeResult> PublishAsync(Guid id, CancellationToken ct) => SetPublishedAsync(id, true, ct);

    public Task<ProductStatusChangeResult> UnpublishAsync(Guid id, CancellationToken ct) => SetPublishedAsync(id, false, ct);

    private async Task<ProductStatusChangeResult> SetPublishedAsync(Guid id, bool published, CancellationToken ct)
    {
        Ctx.Require(Permission.ProductsManage);
        var product = await LoadAsync(id, tracked: true, ct);
        if (product.IsArchived) throw new ConflictException("product_archived", "Archivierte Produkte können nicht veröffentlicht werden.");
        product.IsPublished = published;
        product.UpdatedAt = clock.GetUtcNow();
        audit.Log(Ctx.TenantId, Ctx.UserId, published ? "product.published" : "product.unpublished", nameof(Product), id.ToString());
        await SaveWithConcurrencyAsync(ct);

        var active = await ActiveReservationCountAsync(id, ct);
        var message = !published && active > 0
            ? $"Das Produkt ist nicht mehr bestellbar. {active} bestehende Reservierung(en) bleiben gültig und müssen erfüllt werden."
            : null;
        return new ProductStatusChangeResult(await ToDtoAsync(product, ct), active, message);
    }

    /// <summary>Archives instead of deleting so historical orders keep their product reference. Blocked while reservations are open.</summary>
    public async Task<ProductStatusChangeResult> ArchiveAsync(Guid id, CancellationToken ct)
    {
        Ctx.Require(Permission.ProductsManage);
        var product = await LoadAsync(id, tracked: true, ct);
        var active = await ActiveReservationCountAsync(id, ct);
        if (active > 0)
            throw new ConflictException("product_has_active_reservations",
                $"Das Produkt hat noch {active} offene Reservierung(en). Bitte zuerst erfüllen oder stornieren, oder das Produkt nur offline nehmen.",
                new Dictionary<string, object?> { ["activeReservations"] = active });
        product.IsArchived = true;
        product.IsPublished = false;
        product.UpdatedAt = clock.GetUtcNow();
        audit.Log(Ctx.TenantId, Ctx.UserId, "product.archived", nameof(Product), id.ToString());
        await SaveWithConcurrencyAsync(ct);
        return new ProductStatusChangeResult(await ToDtoAsync(product, ct), 0, null);
    }

    public async Task<ProductDto> RestoreAsync(Guid id, CancellationToken ct)
    {
        Ctx.Require(Permission.ProductsManage);
        await guard.EnsureCanAddProductAsync(Ctx.TenantId, ct);
        var product = await LoadAsync(id, tracked: true, ct);
        product.IsArchived = false;
        product.UpdatedAt = clock.GetUtcNow();
        audit.Log(Ctx.TenantId, Ctx.UserId, "product.restored", nameof(Product), id.ToString());
        await SaveWithConcurrencyAsync(ct);
        return await ToDtoAsync(product, ct);
    }

    public async Task<ProductDto> CopyAsync(Guid id, CancellationToken ct)
    {
        Ctx.Require(Permission.ProductsManage);
        await guard.EnsureCanAddProductAsync(Ctx.TenantId, ct);
        var source = await LoadAsync(id, tracked: false, ct);
        var now = clock.GetUtcNow();
        var copyName = $"{source.Name} (Kopie)";
        var copy = new Product
        {
            TenantId = Ctx.TenantId, CategoryId = source.CategoryId, Name = copyName, Slug = await UniqueSlugAsync(copyName, null, ct),
            Description = source.Description, BasePrice = source.BasePrice, Currency = source.Currency, ImageUrl = source.ImageUrl,
            Allergens = source.Allergens, Ingredients = source.Ingredients, DietaryLabels = source.DietaryLabels,
            LeadTimeHours = source.LeadTimeHours, DefaultDailyQuantity = source.DefaultDailyQuantity, SortOrder = source.SortOrder,
            IsPublished = false, CreatedAt = now, UpdatedAt = now,
        };
        db.Products.Add(copy);
        audit.Log(Ctx.TenantId, Ctx.UserId, "product.copied", nameof(Product), copy.Id.ToString(), new { sourceId = id });
        await db.SaveChangesAsync(ct);
        return await ToDtoAsync(copy, ct);
    }

    private Task<int> ActiveReservationCountAsync(Guid productId, CancellationToken ct) =>
        db.OrderItems.CountAsync(i => i.TenantId == Ctx.TenantId && i.ProductId == productId &&
            db.Orders.Any(o => o.Id == i.OrderId && (o.Status == OrderStatus.Confirmed || o.Status == OrderStatus.Preparing || o.Status == OrderStatus.ReadyForPickup)), ct);

    private async Task<Product> LoadAsync(Guid id, bool tracked, CancellationToken ct)
    {
        var q = db.Products.Where(p => p.Id == id && p.TenantId == Ctx.TenantId);
        if (!tracked) q = q.AsNoTracking();
        return await q.FirstOrDefaultAsync(ct) ?? throw new NotFoundException("Produkt nicht gefunden.", "product_not_found");
    }

    private async Task EnsureCategoryAsync(Guid? categoryId, CancellationToken ct)
    {
        if (categoryId is { } id && !await db.ProductCategories.AnyAsync(c => c.Id == id && c.TenantId == Ctx.TenantId, ct))
            throw new BusinessRuleException("invalid_category", "Die gewählte Kategorie existiert nicht.");
    }

    private async Task<string> UniqueSlugAsync(string name, Guid? excludeId, CancellationToken ct)
    {
        var baseSlug = Codes.Slugify(name);
        if (baseSlug.Length == 0) baseSlug = "produkt";
        var slug = baseSlug;
        for (var i = 2; await db.Products.AnyAsync(p => p.TenantId == Ctx.TenantId && p.Slug == slug && p.Id != excludeId, ct); i++)
            slug = $"{baseSlug}-{i}";
        return slug;
    }

    private async Task SaveWithConcurrencyAsync(CancellationToken ct)
    {
        try { await db.SaveChangesAsync(ct); }
        catch (DbUpdateConcurrencyException)
        {
            throw new ConflictException("product_modified_concurrently", "Das Produkt wurde zwischenzeitlich geändert. Bitte neu laden.");
        }
    }

    private static void Apply(Product p, UpsertProductRequest r, DateTimeOffset now)
    {
        p.Name = r.Name.Trim();
        p.Description = Clean(r.Description);
        p.CategoryId = r.CategoryId;
        p.BasePrice = Codes.RoundMoney(r.BasePrice);
        p.ImageUrl = Clean(r.ImageUrl);
        p.Allergens = Clean(r.Allergens);
        p.Ingredients = Clean(r.Ingredients);
        p.DietaryLabels = r.DietaryLabels is { Count: > 0 }
            ? string.Join(',', r.DietaryLabels.Select(l => l.Trim()).Where(l => l.Length > 0).Distinct())
            : null;
        p.LeadTimeHours = r.LeadTimeHours;
        p.DefaultDailyQuantity = r.DefaultDailyQuantity;
        p.SortOrder = r.SortOrder;
        p.UpdatedAt = now;
    }

    private static string? Clean(string? s) => string.IsNullOrWhiteSpace(s) ? null : s.Trim();

    private async Task<ProductDto> ToDtoAsync(Product p, CancellationToken ct)
    {
        var categoryName = p.CategoryId is { } cid
            ? await db.ProductCategories.AsNoTracking().Where(c => c.Id == cid).Select(c => c.Name).FirstOrDefaultAsync(ct)
            : null;
        return ToDto(p, categoryName);
    }

    public static ProductDto ToDto(Product p, string? categoryName) => new(
        p.Id, p.Name, p.Slug, p.Description, p.CategoryId, categoryName, p.BasePrice, p.Currency, p.ImageUrl, p.IsPublished, p.IsArchived,
        p.Allergens, p.Ingredients, StockLevels.SplitLabels(p.DietaryLabels), p.LeadTimeHours, p.DefaultDailyQuantity, p.SortOrder,
        p.CreatedAt, p.UpdatedAt);
}
