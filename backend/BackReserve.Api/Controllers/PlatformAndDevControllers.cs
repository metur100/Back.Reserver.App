using BackReserve.Application.Common;
using BackReserve.Application.Contracts;
using BackReserve.Application.Platform;
using BackReserve.Domain.Enums;
using BackReserve.Infrastructure.Email;
using BackReserve.Infrastructure.Jobs;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;

namespace BackReserve.Api.Controllers;

[ApiController]
[Authorize(Policy = "PlatformAdmin")]
[Route("api/v1/platform")]
[Tags("Platform")]
public sealed class PlatformController(PlatformService platform) : ControllerBase
{
    public sealed record TenantStatusRequest(string? Reason);

    [HttpGet("tenants")]
    public Task<PagedResult<PlatformTenantDto>> Tenants([FromQuery] string? search, [FromQuery] int page = 1, [FromQuery] int pageSize = 25,
        CancellationToken ct = default) => platform.ListTenantsAsync(search, page, pageSize, ct);

    [HttpPost("tenants/{id:guid}/suspend")]
    public async Task<IActionResult> Suspend(Guid id, TenantStatusRequest request, CancellationToken ct)
    {
        await platform.SetTenantStatusAsync(id, TenantStatus.Suspended, request.Reason, ct);
        return NoContent();
    }

    [HttpPost("tenants/{id:guid}/reactivate")]
    public async Task<IActionResult> Reactivate(Guid id, TenantStatusRequest request, CancellationToken ct)
    {
        await platform.SetTenantStatusAsync(id, TenantStatus.Active, request.Reason, ct);
        return NoContent();
    }

    [HttpGet("health")]
    public Task<PlatformHealthDto> Health(CancellationToken ct) => platform.GetHealthAsync(ct);
}

/// <summary>
/// Development-only helpers (captured emails incl. invitation and confirmation links). Returns 404 unless the host runs in
/// the Development environment AND Email:CaptureInDevMailbox is enabled, so it can never leak links in production.
/// </summary>
[ApiController]
[Route("api/v1/dev")]
[ApiExplorerSettings(IgnoreApi = true)]
public sealed class DevController(IHostEnvironment env, IOptions<EmailOptions> email, DevMailbox mailbox, OutboxDispatcher dispatcher) : ControllerBase
{
    private bool Enabled => env.IsDevelopment() && email.Value.CaptureInDevMailbox;

    [HttpGet("mailbox")]
    public async Task<IActionResult> Mailbox([FromQuery] string? to, CancellationToken ct)
    {
        if (!Enabled) return NotFound();
        await dispatcher.DispatchPendingAsync(ct, 100); // deliver pending outbox messages immediately for convenience
        var messages = mailbox.All();
        if (!string.IsNullOrWhiteSpace(to)) messages = messages.Where(m => m.To.Equals(to, StringComparison.OrdinalIgnoreCase)).ToList();
        return Ok(messages);
    }

    [HttpDelete("mailbox")]
    public IActionResult ClearMailbox()
    {
        if (!Enabled) return NotFound();
        mailbox.Clear();
        return NoContent();
    }
}
