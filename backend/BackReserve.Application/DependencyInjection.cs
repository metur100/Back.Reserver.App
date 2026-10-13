using BackReserve.Application.Catalog;
using BackReserve.Application.Common;
using BackReserve.Application.Inventory;
using BackReserve.Application.Locations;
using BackReserve.Application.Orders;
using BackReserve.Application.Platform;
using BackReserve.Application.Reporting;
using BackReserve.Application.Settings;
using BackReserve.Application.Staff;
using BackReserve.Application.Subscriptions;
using Microsoft.Extensions.DependencyInjection;

namespace BackReserve.Application;

public static class DependencyInjection
{
    public static IServiceCollection AddApplication(this IServiceCollection services)
    {
        services.AddScoped<IAdminContextAccessor, AdminContextAccessor>();
        services.AddScoped<PublicCatalogService>();
        services.AddScoped<ReservationService>();
        services.AddScoped<OrderLifecycleService>();
        services.AddScoped<AdminOrderService>();
        services.AddScoped<ProductService>();
        services.AddScoped<InventoryService>();
        services.AddScoped<LocationService>();
        services.AddScoped<StaffService>();
        services.AddScoped<SettingsService>();
        services.AddScoped<NotificationService>();
        services.AddScoped<SubscriptionGuard>();
        services.AddScoped<SubscriptionService>();
        services.AddScoped<DashboardService>();
        services.AddScoped<ReportService>();
        services.AddScoped<PlatformService>();
        services.AddSingleton<Payments.IPaymentGateway, Payments.PayAtPickupGateway>();
        return services;
    }
}
