using BackReserve.Infrastructure.Email;
using BackReserve.Infrastructure.Jobs;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Data.SqlClient;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Time.Testing;
using Testcontainers.MsSql;

namespace BackReserve.IntegrationTests.Infrastructure;

/// <summary>
/// Hosts the real API against a real SQL Server (never SQLite or in-memory, because the concurrency guarantees rely on
/// SQL Server locking semantics). Uses BACKRESERVE_TEST_SQLSERVER if set (e.g. the docker-compose instance or a CI
/// service container); otherwise starts a disposable SQL Server container via Testcontainers.
/// </summary>
public sealed class ApiFactory : WebApplicationFactory<Program>, IAsyncLifetime
{
    private MsSqlContainer? _container;
    private string _connectionString = "";

    /// <summary>Advances 1 ms per read so timestamps written by the app stay strictly ordered.</summary>
    public FakeTimeProvider Clock { get; } = new(DateTimeOffset.UtcNow) { AutoAdvanceAmount = TimeSpan.FromMilliseconds(1) };
    public string UploadPath { get; } = Path.Combine(Path.GetTempPath(), "backreserve-tests", Guid.NewGuid().ToString("N"));

    public async Task InitializeAsync()
    {
        var external = Environment.GetEnvironmentVariable("BACKRESERVE_TEST_SQLSERVER");
        string serverConnection;
        if (!string.IsNullOrWhiteSpace(external))
        {
            serverConnection = external;
        }
        else
        {
            _container = new MsSqlBuilder("mcr.microsoft.com/mssql/server:2022-latest").Build();
            await _container.StartAsync();
            serverConnection = _container.GetConnectionString();
        }
        var builder = new SqlConnectionStringBuilder(serverConnection)
        {
            InitialCatalog = $"BackReserveTests_{DateTime.UtcNow:yyyyMMddHHmmss}_{Guid.NewGuid():N}"[..60],
            TrustServerCertificate = true,
            MaxPoolSize = 200,
        };
        _connectionString = builder.ConnectionString;
        _ = Services; // build the host: migrations + reference data run on startup (Database:MigrateOnStartup)
    }

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Testing");
        builder.UseSetting("ConnectionStrings:Default", _connectionString);
        builder.UseSetting("Database:MigrateOnStartup", "true");
        builder.UseSetting("Jwt:SigningKey", "integration-tests-signing-key-0123456789abcdef0123");
        builder.UseSetting("Jobs:Enabled", "false");
        builder.UseSetting("RateLimiting:Enabled", "false");
        builder.UseSetting("Email:Provider", "None");
        builder.UseSetting("Email:CaptureInDevMailbox", "true");
        builder.UseSetting("Auth:RequireConfirmedEmail", "true");
        builder.UseSetting("Billing:AllowDevelopmentPlanChanges", "true");
        builder.UseSetting("App:WebBaseUrl", "http://web.test");
        // Expected database errors (e.g. losing duplicate-key races) would otherwise flood the test output.
        builder.UseSetting("Logging:LogLevel:Default", "Warning");
        builder.UseSetting("Logging:LogLevel:Microsoft.EntityFrameworkCore", "None");
        builder.UseSetting("Logging:LogLevel:Microsoft.AspNetCore.HttpsPolicy", "Error");
        builder.UseSetting("Storage:LocalPath", UploadPath);
        builder.ConfigureServices(services =>
        {
            services.RemoveAll<TimeProvider>();
            services.AddSingleton<TimeProvider>(Clock);
        });
    }

    public HttpClient CreateApiClient() => CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false, HandleCookies = false });

    public DevMailbox Mailbox => Services.GetRequiredService<DevMailbox>();

    public async Task FlushOutboxAsync()
    {
        using var scope = Services.CreateScope();
        await scope.ServiceProvider.GetRequiredService<OutboxDispatcher>().DispatchPendingAsync(CancellationToken.None, 500);
    }

    public new async Task DisposeAsync()
    {
        try
        {
            await using var connection = new SqlConnection(new SqlConnectionStringBuilder(_connectionString) { InitialCatalog = "master" }.ConnectionString);
            await connection.OpenAsync();
            var db = new SqlConnectionStringBuilder(_connectionString).InitialCatalog;
            SqlConnection.ClearAllPools();
            await using var cmd = connection.CreateCommand();
            cmd.CommandText = $"IF DB_ID('{db}') IS NOT NULL BEGIN ALTER DATABASE [{db}] SET SINGLE_USER WITH ROLLBACK IMMEDIATE; DROP DATABASE [{db}]; END";
            await cmd.ExecuteNonQueryAsync();
        }
        catch
        {
            // best effort cleanup
        }
        await base.DisposeAsync();
        if (_container is not null) await _container.DisposeAsync();
    }
}

[CollectionDefinition(Name)]
public sealed class ApiCollection : ICollectionFixture<ApiFactory>
{
    public const string Name = "api";
}
