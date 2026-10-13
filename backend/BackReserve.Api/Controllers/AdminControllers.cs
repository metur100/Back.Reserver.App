using BackReserve.Api.Infrastructure;
using BackReserve.Application.Abstractions;
using BackReserve.Application.Catalog;
using BackReserve.Application.Common;
using BackReserve.Application.Contracts;
using BackReserve.Application.Inventory;
using BackReserve.Application.Locations;
using BackReserve.Application.Orders;
using BackReserve.Application.Reporting;
using BackReserve.Application.Settings;
using BackReserve.Application.Staff;
using BackReserve.Application.Subscriptions;
using BackReserve.Domain.Enums;
using BackReserve.Infrastructure.Storage;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;

namespace BackReserve.Api.Controllers;

/// <summary>All bakery administration endpoints require authentication and a verified tenant membership.</summary>
[ApiController]
[Authorize]
[ServiceFilter(typeof(TenantMemberFilter))]
public abstract class AdminControllerBase : ControllerBase;

[Route("api/v1/admin/dashboard")]
[Tags("Admin: dashboard")]
public sealed class AdminDashboardController(DashboardService dashboard) : AdminControllerBase
{
    [HttpGet]
    public Task<DashboardDto> Get([FromQuery] Guid? locationId, CancellationToken ct) => dashboard.GetAsync(locationId, ct);
}

[Route("api/v1/admin/orders")]
[Tags("Admin: orders")]
public sealed class AdminOrdersController(AdminOrderService orders) : AdminControllerBase
{
    [HttpGet]
    public Task<PagedResult<OrderListItemDto>> List([FromQuery] OrderQuery query, CancellationToken ct) => orders.ListAsync(query, ct);

    [HttpGet("{id:guid}")]
    public Task<OrderDetailDto> Get(Guid id, CancellationToken ct) => orders.GetAsync(id, ct);

    /// <summary>Pickup lookup by code (manual entry or QR scan).</summary>
    [HttpGet("lookup")]
    public Task<OrderDetailDto> Lookup([FromQuery] string code, CancellationToken ct) => orders.LookupByReferenceAsync(code, ct);

    [HttpPost("{id:guid}/prepare")]
    public Task<OrderDetailDto> Prepare(Guid id, CancellationToken ct) => orders.ChangeStatusAsync(id, OrderStatus.Preparing, null, ct);

    [HttpPost("{id:guid}/ready")]
    public Task<OrderDetailDto> Ready(Guid id, CancellationToken ct) => orders.ChangeStatusAsync(id, OrderStatus.ReadyForPickup, null, ct);

    [HttpPost("{id:guid}/collect")]
    public Task<OrderDetailDto> Collect(Guid id, CancellationToken ct) => orders.ChangeStatusAsync(id, OrderStatus.Collected, null, ct);

    [HttpPost("{id:guid}/cancel")]
    public Task<OrderDetailDto> Cancel(Guid id, OrderActionRequest request, CancellationToken ct) =>
        orders.ChangeStatusAsync(id, OrderStatus.Cancelled, request.Reason, ct);

    [HttpPost("{id:guid}/no-show")]
    public Task<OrderDetailDto> NoShow(Guid id, CancellationToken ct) => orders.ChangeStatusAsync(id, OrderStatus.NoShow, null, ct);

    /// <summary>Report a pickup problem; recorded in the history without changing the status.</summary>
    [HttpPost("{id:guid}/problem")]
    public Task<OrderDetailDto> ReportProblem(Guid id, ReportProblemRequest request, CancellationToken ct) =>
        orders.ReportProblemAsync(id, request.Note, ct);
}

[Route("api/v1/admin/products")]
[Tags("Admin: products")]
public sealed class AdminProductsController(ProductService products) : AdminControllerBase
{
    [HttpGet]
    public Task<PagedResult<ProductDto>> List([FromQuery] ProductQuery query, CancellationToken ct) => products.ListAsync(query, ct);

    [HttpPost]
    public async Task<ActionResult<ProductDto>> Create(UpsertProductRequest request, CancellationToken ct)
    {
        var created = await products.CreateAsync(request, ct);
        return CreatedAtAction(nameof(Get), new { id = created.Id }, created);
    }

    [HttpGet("{id:guid}")]
    public Task<ProductDto> Get(Guid id, CancellationToken ct) => products.GetAsync(id, ct);

    [HttpPut("{id:guid}")]
    public Task<ProductDto> Update(Guid id, UpsertProductRequest request, CancellationToken ct) => products.UpdateAsync(id, request, ct);

    [HttpPost("{id:guid}/publish")]
    public Task<ProductStatusChangeResult> Publish(Guid id, CancellationToken ct) => products.PublishAsync(id, ct);

    [HttpPost("{id:guid}/unpublish")]
    public Task<ProductStatusChangeResult> Unpublish(Guid id, CancellationToken ct) => products.UnpublishAsync(id, ct);

    [HttpPost("{id:guid}/archive")]
    public Task<ProductStatusChangeResult> Archive(Guid id, CancellationToken ct) => products.ArchiveAsync(id, ct);

    [HttpPost("{id:guid}/restore")]
    public Task<ProductDto> Restore(Guid id, CancellationToken ct) => products.RestoreAsync(id, ct);

    [HttpPost("{id:guid}/copy")]
    public Task<ProductDto> Copy(Guid id, CancellationToken ct) => products.CopyAsync(id, ct);
}

[Route("api/v1/admin/categories")]
[Tags("Admin: products")]
public sealed class AdminCategoriesController(ProductService products) : AdminControllerBase
{
    [HttpGet]
    public Task<IReadOnlyList<CategoryDto>> List(CancellationToken ct) => products.ListCategoriesAsync(ct);

    [HttpPost]
    public Task<CategoryDto> Create(UpsertCategoryRequest request, CancellationToken ct) => products.CreateCategoryAsync(request, ct);

    [HttpPut("{id:guid}")]
    public Task<CategoryDto> Update(Guid id, UpsertCategoryRequest request, CancellationToken ct) => products.UpdateCategoryAsync(id, request, ct);

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id, CancellationToken ct)
    {
        await products.DeleteCategoryAsync(id, ct);
        return NoContent();
    }
}

[Route("api/v1/admin/inventory")]
[Tags("Admin: inventory")]
public sealed class AdminInventoryController(InventoryService inventory) : AdminControllerBase
{
    /// <summary>Production overview: planned vs reserved and quantities per pickup slot.</summary>
    [HttpGet]
    public Task<ProductionOverviewDto> Overview([FromQuery] Guid locationId, [FromQuery] DateOnly date, CancellationToken ct) =>
        inventory.GetProductionOverviewAsync(locationId, date, ct);

    [HttpGet("daily")]
    public Task<DailyInventoryDto> GetDaily([FromQuery] Guid locationId, [FromQuery] DateOnly date, CancellationToken ct) =>
        inventory.GetDailyAsync(locationId, date, ct);

    [HttpPut("daily")]
    public Task<DailyInventoryDto> UpdateDaily(UpdateDailyInventoryRequest request, CancellationToken ct) => inventory.UpdateDailyAsync(request, ct);

    [HttpPost("copy-day")]
    public Task<CopyDayResult> CopyDay(CopyDayRequest request, CancellationToken ct) => inventory.CopyDayAsync(request, ct);

    [HttpPost("apply-defaults")]
    public Task<CopyDayResult> ApplyDefaults(ApplyDefaultsRequest request, CancellationToken ct) => inventory.ApplyDefaultsAsync(request, ct);
}

[Route("api/v1/admin/locations")]
[Tags("Admin: locations")]
public sealed class AdminLocationsController(LocationService locations) : AdminControllerBase
{
    [HttpGet]
    public Task<IReadOnlyList<LocationDto>> List(CancellationToken ct) => locations.ListAsync(ct);

    [HttpGet("{id:guid}")]
    public Task<LocationDto> Get(Guid id, CancellationToken ct) => locations.GetAsync(id, ct);

    [HttpPost]
    public Task<LocationDto> Create(UpsertLocationRequest request, CancellationToken ct) => locations.CreateAsync(request, ct);

    [HttpPut("{id:guid}")]
    public Task<LocationDto> Update(Guid id, UpsertLocationRequest request, CancellationToken ct) => locations.UpdateAsync(id, request, ct);

    [HttpPut("{id:guid}/settings")]
    public Task<LocationDto> UpdateSettings(Guid id, LocationSettingsDto settings, CancellationToken ct) => locations.UpdateSettingsAsync(id, settings, ct);

    [HttpPost("{id:guid}/closures")]
    public Task<LocationDto> AddClosure(Guid id, AddClosureRequest request, CancellationToken ct) => locations.AddClosureAsync(id, request, ct);

    [HttpDelete("{id:guid}/closures/{closureId:guid}")]
    public Task<LocationDto> RemoveClosure(Guid id, Guid closureId, CancellationToken ct) => locations.RemoveClosureAsync(id, closureId, ct);
}

[Route("api/v1/admin/pickup-schedules")]
[Tags("Admin: locations")]
public sealed class AdminPickupSchedulesController(LocationService locations) : AdminControllerBase
{
    [HttpGet]
    public async Task<IReadOnlyList<ScheduleRuleDto>> Get([FromQuery] Guid locationId, CancellationToken ct) =>
        (await locations.GetAsync(locationId, ct)).Schedule;

    [HttpPut]
    public Task<LocationDto> Update(UpdateScheduleRequest request, CancellationToken ct) => locations.UpdateScheduleAsync(request, ct);
}

[Route("api/v1/admin/staff")]
[Tags("Admin: staff")]
public sealed class AdminStaffController(StaffService staff) : AdminControllerBase
{
    [HttpGet]
    public Task<StaffOverviewDto> Get(CancellationToken ct) => staff.GetAsync(ct);

    [HttpPost("invite")]
    public Task<InvitationDto> Invite(InviteStaffRequest request, CancellationToken ct) => staff.InviteAsync(request, ct);

    [HttpDelete("invitations/{id:guid}")]
    public async Task<IActionResult> Revoke(Guid id, CancellationToken ct)
    {
        await staff.RevokeInvitationAsync(id, ct);
        return NoContent();
    }

    [HttpPut("{membershipId:guid}")]
    public Task<StaffOverviewDto> Update(Guid membershipId, UpdateMembershipRequest request, CancellationToken ct) =>
        staff.UpdateMembershipAsync(membershipId, request, ct);
}

[Route("api/v1/admin/reports")]
[Tags("Admin: reports")]
public sealed class AdminReportsController(ReportService reports) : AdminControllerBase
{
    [HttpGet("summary")]
    public Task<ReportSummaryDto> Summary([FromQuery] ReportQuery query, CancellationToken ct) => reports.GetSummaryAsync(query, ct);

    [HttpGet("orders")]
    public async Task<IReadOnlyList<OrdersByDayDto>> Orders([FromQuery] ReportQuery query, CancellationToken ct) =>
        (await reports.GetSummaryAsync(query, ct)).ByDay;

    [HttpGet("products")]
    public async Task<IReadOnlyList<ProductReportDto>> Products([FromQuery] ReportQuery query, CancellationToken ct) =>
        (await reports.GetSummaryAsync(query, ct)).ByProduct;

    [HttpGet("reservations")]
    public async Task<IReadOnlyList<SlotReportDto>> Reservations([FromQuery] ReportQuery query, CancellationToken ct) =>
        (await reports.GetSummaryAsync(query, ct)).BySlot;

    /// <summary>CSV export (orders | products | slots), escaped against spreadsheet formula injection.</summary>
    [HttpGet("{type}/export")]
    public async Task<IActionResult> Export(string type, [FromQuery] ReportQuery query, CancellationToken ct)
    {
        var (fileName, content) = await reports.ExportCsvAsync(type, query, ct);
        return File(content, "text/csv; charset=utf-8", fileName);
    }
}

[Route("api/v1/admin/settings")]
[Tags("Admin: settings")]
public sealed class AdminSettingsController(SettingsService settings) : AdminControllerBase
{
    [HttpGet]
    public Task<TenantSettingsDto> Get(CancellationToken ct) => settings.GetAsync(ct);

    [HttpPut]
    public Task<TenantSettingsDto> Update(UpdateTenantSettingsRequest request, CancellationToken ct) => settings.UpdateAsync(request, ct);
}

[Route("api/v1/admin/subscription")]
[Tags("Admin: subscription")]
public sealed class AdminSubscriptionController(SubscriptionService subscriptions) : AdminControllerBase
{
    [HttpGet]
    public Task<SubscriptionDto> Get(CancellationToken ct) => subscriptions.GetCurrentAsync(ct);

    [HttpGet("plans")]
    public Task<IReadOnlyList<SubscriptionPlanDto>> Plans(CancellationToken ct) => subscriptions.GetPlansAsync(ct);

    /// <summary>Development-only plan switch (Billing:AllowDevelopmentPlanChanges). No payment is processed.</summary>
    [HttpPost("change-plan")]
    public Task<SubscriptionDto> ChangePlan(ChangePlanRequest request, CancellationToken ct) => subscriptions.ChangePlanAsync(request, ct);
}

[Route("api/v1/admin/notifications")]
[Tags("Admin: dashboard")]
public sealed class AdminNotificationsController(NotificationService notifications) : AdminControllerBase
{
    [HttpGet]
    public Task<IReadOnlyList<NotificationDto>> List([FromQuery] bool unreadOnly, CancellationToken ct) => notifications.ListAsync(unreadOnly, ct);

    [HttpPost("read-all")]
    public async Task<IActionResult> ReadAll(CancellationToken ct)
    {
        await notifications.MarkAllReadAsync(ct);
        return NoContent();
    }
}

[Route("api/v1/admin/uploads")]
[Tags("Admin: uploads")]
public sealed class AdminUploadsController(IAdminContextAccessor admin, IFileStorage storage, IAuditLogger audit, IOptions<StorageOptions> options)
    : AdminControllerBase
{
    public sealed record UploadResult(string Url);

    /// <summary>Image upload (JPEG, PNG, WebP; max 5 MB). The type is detected from file content; names are server generated.</summary>
    [HttpPost("images")]
    [RequestSizeLimit(6 * 1024 * 1024)]
    public async Task<UploadResult> UploadImage(IFormFile file, CancellationToken ct)
    {
        var ctx = admin.Context;
        if (!ctx.Has(Permission.ProductsManage) && !ctx.Has(Permission.SettingsManage)) throw new ForbiddenException();
        if (file.Length == 0) throw new BusinessRuleException("empty_file", "Die Datei ist leer.");
        if (file.Length > options.Value.MaxImageBytes) throw new BusinessRuleException("file_too_large", "Das Bild darf höchstens 5 MB groß sein.");

        await using var buffer = new MemoryStream();
        await file.CopyToAsync(buffer, ct);
        var (extension, contentType) = ImageValidator.Detect(buffer.GetBuffer().AsSpan(0, (int)Math.Min(buffer.Length, 16)));
        buffer.Position = 0;
        var url = await storage.SaveAsync(buffer, extension, contentType, ct);
        audit.Log(ctx.TenantId, ctx.UserId, "upload.image", "File", url, new { size = file.Length, contentType });
        return new UploadResult(url);
    }
}
