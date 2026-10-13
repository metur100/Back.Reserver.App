using BackReserve.Application.Abstractions;
using BackReserve.Application.Subscriptions;
using BackReserve.Domain.Entities;
using BackReserve.Infrastructure.Email;
using BackReserve.Infrastructure.Identity;
using BackReserve.Infrastructure.Jobs;
using BackReserve.Infrastructure.Persistence;
using BackReserve.Infrastructure.Persistence.Seeding;
using BackReserve.Infrastructure.Services;
using BackReserve.Infrastructure.Storage;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace BackReserve.Infrastructure;

public static class DependencyInjection
{
    public static IServiceCollection AddInfrastructure(this IServiceCollection services, IConfiguration config)
    {
        var connectionString = config.GetConnectionString("Default")
            ?? throw new InvalidOperationException("ConnectionStrings:Default is not configured.");

        services.AddDbContext<AppDbContext>(o => o.UseSqlServer(connectionString, sql =>
        {
            sql.MigrationsAssembly(typeof(AppDbContext).Assembly.FullName);
            sql.CommandTimeout(30);
        }));
        services.AddScoped<IAppDbContext>(sp => sp.GetRequiredService<AppDbContext>());

        services.Configure<AppUrlOptions>(config.GetSection(AppUrlOptions.Section));
        services.Configure<EmailOptions>(config.GetSection(EmailOptions.Section));
        services.Configure<StorageOptions>(config.GetSection(StorageOptions.Section));
        services.Configure<JobOptions>(config.GetSection(JobOptions.Section));
        services.Configure<JwtOptions>(config.GetSection(JwtOptions.Section));
        services.Configure<AuthOptions>(config.GetSection(AuthOptions.Section));
        services.Configure<BillingOptions>(config.GetSection(BillingOptions.Section));
        services.Configure<SeedOptions>(config.GetSection(SeedOptions.Section));
        services.Configure<PlatformAdminOptions>(config.GetSection(PlatformAdminOptions.Section));

        services.AddSingleton(TimeProvider.System);
        services.AddDataProtection().PersistKeysToDbContext<AppDbContext>().SetApplicationName("BackReserve");

        services.AddIdentityCore<ApplicationUser>(o =>
            {
                o.User.RequireUniqueEmail = true;
                o.Password.RequiredLength = 10;
                o.Password.RequireDigit = true;
                o.Password.RequireLowercase = false;
                o.Password.RequireUppercase = false;
                o.Password.RequireNonAlphanumeric = false;
                o.Lockout.AllowedForNewUsers = true;
                o.Lockout.MaxFailedAccessAttempts = 5;
                o.Lockout.DefaultLockoutTimeSpan = TimeSpan.FromMinutes(15);
                o.SignIn.RequireConfirmedEmail = false; // enforced explicitly in AuthService via Auth:RequireConfirmedEmail
            })
            .AddRoles<IdentityRole<Guid>>()
            .AddEntityFrameworkStores<AppDbContext>()
            .AddDefaultTokenProviders();
        services.Configure<DataProtectionTokenProviderOptions>(o => o.TokenLifespan = TimeSpan.FromHours(24));

        services.AddScoped<ISlotCounterStore, SqlServerSlotCounterStore>();
        services.AddSingleton<IDbErrorClassifier, SqlServerErrorClassifier>();
        services.AddSingleton<IPayloadProtector, PayloadProtector>();
        services.AddScoped<IEmailOutbox, EmailOutbox>();
        services.AddScoped<IAuditLogger, AuditLogger>();
        services.AddSingleton<DevMailbox>();
        services.AddScoped<IEmailSender, EmailSender>();
        services.AddSingleton<LocalFileStorage>();
        services.AddSingleton<IFileStorage>(sp => sp.GetRequiredService<LocalFileStorage>());

        services.AddScoped<TokenService>();
        services.AddScoped<AuthService>();
        services.AddScoped<DataSeeder>();
        services.AddScoped<OutboxDispatcher>();
        services.AddScoped<MaintenanceJobs>();

        if (config.GetValue(JobOptions.Section + ":Enabled", true))
        {
            services.AddHostedService<OutboxWorker>();
            services.AddHostedService<MaintenanceWorker>();
        }
        return services;
    }
}
