using System.Globalization;
using System.Text;
using BackReserve.Application.Abstractions;
using BackReserve.Application.Common;
using BackReserve.Application.Contracts;
using BackReserve.Application.Subscriptions;
using BackReserve.Domain.Entities;
using BackReserve.Domain.Enums;
using Microsoft.EntityFrameworkCore;

namespace BackReserve.Application.Reporting;

/// <summary>
/// Reservation reports. "ReservedValue" is the value of non-cancelled reservations — not collected revenue and not
/// accounting revenue, because payment happens at the counter outside BackReserve.
/// </summary>
public sealed class ReportService(IAppDbContext db, IAdminContextAccessor admin, SubscriptionGuard guard, IAuditLogger audit)
{
    private AdminContext Ctx => admin.Context;

    private IQueryable<Order> Scoped(ReportQuery query)
    {
        if (query.To < query.From) throw new BusinessRuleException("invalid_range", "Das Enddatum liegt vor dem Startdatum.");
        if (query.To.DayNumber - query.From.DayNumber > 366) throw new BusinessRuleException("range_too_large", "Der Zeitraum darf höchstens ein Jahr umfassen.");
        var q = db.Orders.AsNoTracking().Where(o => o.TenantId == Ctx.TenantId && o.PickupDate >= query.From && o.PickupDate <= query.To);
        if (query.LocationId is { } id)
        {
            Ctx.EnsureLocation(id);
            q = q.Where(o => o.LocationId == id);
        }
        else if (Ctx.LocationIds is { } allowed) q = q.Where(o => allowed.Contains(o.LocationId));
        return q;
    }

    public async Task<ReportSummaryDto> GetSummaryAsync(ReportQuery query, CancellationToken ct)
    {
        Ctx.Require(Permission.ReportsView);
        var orders = Scoped(query);

        var byDay = await orders.GroupBy(o => o.PickupDate).Select(g => new OrdersByDayDto(
                g.Key,
                g.Count(o => o.Status != OrderStatus.Cancelled),
                g.Where(o => o.Status != OrderStatus.Cancelled).Sum(o => o.ItemCount),
                g.Where(o => o.Status != OrderStatus.Cancelled).Sum(o => o.Total),
                g.Count(o => o.Status == OrderStatus.Collected),
                g.Count(o => o.Status == OrderStatus.Cancelled),
                g.Count(o => o.Status == OrderStatus.NoShow)))
            .ToListAsync(ct);

        var nonCancelled = orders.Where(o => o.Status != OrderStatus.Cancelled);
        var byProduct = await db.OrderItems.AsNoTracking()
            .Join(nonCancelled, i => i.OrderId, o => o.Id, (i, o) => i)
            .GroupBy(i => new { i.ProductId, i.ProductName })
            .Select(g => new ProductReportDto(g.Key.ProductId, g.Key.ProductName, g.Sum(i => i.Quantity), g.Sum(i => i.LineTotal), g.Count()))
            .ToListAsync(ct);

        var bySlot = await nonCancelled.GroupBy(o => o.SlotStart)
            .Select(g => new SlotReportDto(g.Key, g.Count(), g.Sum(o => o.ItemCount)))
            .ToListAsync(ct);

        var currency = await db.TenantSettings.Where(s => s.TenantId == Ctx.TenantId).Select(s => s.Currency).FirstAsync(ct);
        return new ReportSummaryDto(
            query.From, query.To,
            byDay.Sum(d => d.Orders), byDay.Sum(d => d.Items), byDay.Sum(d => d.ReservedValue),
            byDay.Sum(d => d.Cancelled), byDay.Sum(d => d.NoShow), byDay.Sum(d => d.Collected), currency,
            byDay.OrderBy(d => d.Date).ToList(),
            byProduct.OrderByDescending(p => p.Quantity).ThenBy(p => p.ProductName).ToList(),
            bySlot.OrderBy(s => s.SlotStart).ToList());
    }

    public async Task<(string FileName, byte[] Content)> ExportCsvAsync(string type, ReportQuery query, CancellationToken ct)
    {
        Ctx.Require(Permission.ReportsView);
        await guard.EnsureFeatureAsync(Ctx.TenantId, PlanFeature.CsvExport, ct);
        var summary = await GetSummaryAsync(query, ct);
        var de = CultureInfo.GetCultureInfo("de-DE");
        var rows = new List<string[]>();
        switch (type)
        {
            case "orders":
                rows.Add(["Datum", "Reservierungen", "Artikel", "Reservierungswert (EUR)", "Abgeholt", "Storniert", "Nicht abgeholt"]);
                rows.AddRange(summary.ByDay.Select(d => new[]
                {
                    d.Date.ToString("dd.MM.yyyy", de), d.Orders.ToString(de), d.Items.ToString(de), d.ReservedValue.ToString("0.00", de),
                    d.Collected.ToString(de), d.Cancelled.ToString(de), d.NoShow.ToString(de),
                }));
                break;
            case "products":
                rows.Add(["Produkt", "Menge", "Reservierungen", "Reservierungswert (EUR)"]);
                rows.AddRange(summary.ByProduct.Select(p => new[]
                {
                    p.ProductName, p.Quantity.ToString(de), p.Orders.ToString(de), p.ReservedValue.ToString("0.00", de),
                }));
                break;
            case "slots":
                rows.Add(["Abholzeit", "Reservierungen", "Artikel"]);
                rows.AddRange(summary.BySlot.Select(s => new[] { s.SlotStart.ToString("HH:mm", de), s.Orders.ToString(de), s.Items.ToString(de) }));
                break;
            default:
                throw new NotFoundException("Unbekannter Bericht.");
        }
        audit.Log(Ctx.TenantId, Ctx.UserId, "report.exported", "Report", type,
            new { from = query.From.ToString("yyyy-MM-dd"), to = query.To.ToString("yyyy-MM-dd"), query.LocationId });
        await db.SaveChangesAsync(ct);
        var fileName = $"backreserve-{type}-{query.From:yyyyMMdd}-{query.To:yyyyMMdd}.csv";
        return (fileName, Csv.Build(rows));
    }
}

public static class Csv
{
    /// <summary>
    /// Semicolon separated (German Excel default), UTF-8 with BOM. Cells that a spreadsheet would interpret as a formula
    /// are prefixed with an apostrophe to prevent CSV/formula injection.
    /// </summary>
    public static byte[] Build(IEnumerable<string[]> rows)
    {
        var sb = new StringBuilder();
        foreach (var row in rows) sb.Append(string.Join(';', row.Select(Escape))).Append("\r\n");
        return [.. Encoding.UTF8.GetPreamble(), .. Encoding.UTF8.GetBytes(sb.ToString())];
    }

    public static string Escape(string? value)
    {
        var v = value ?? "";
        if (v.Length > 0 && v[0] is '=' or '+' or '-' or '@' or '\t' or '\r' or '|' or '%')
        {
            // Plain negative numbers are safe and must stay numeric.
            if (!(v[0] == '-' && decimal.TryParse(v, NumberStyles.Number, CultureInfo.GetCultureInfo("de-DE"), out _)))
                v = "'" + v;
        }
        if (v.IndexOfAny([';', '"', '\n', '\r', ',']) >= 0) v = "\"" + v.Replace("\"", "\"\"") + "\"";
        return v;
    }
}
