using BackReserve.Application.Locations;
using BackReserve.Domain.Entities;
using BackReserve.Domain.Enums;
using BackReserve.Domain.Rules;
using BackReserve.Infrastructure.Identity;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace BackReserve.Infrastructure.Persistence.Seeding;

public sealed class SeedOptions
{
    public const string Section = "Seed";
    /// <summary>Creates fictional demo tenants and accounts. Only honoured in the Development environment unless <see cref="AllowOutsideDevelopment"/>.</summary>
    public bool DemoData { get; set; }
    public string DemoPassword { get; set; } = "";
    /// <summary>
    /// Explicit opt-in for public demo/staging instances. Never enable on a production instance with real bakeries.
    /// </summary>
    public bool AllowOutsideDevelopment { get; set; }
}

public sealed class PlatformAdminOptions
{
    public const string Section = "PlatformAdmin";
    /// <summary>Optional bootstrap admin. Both values must come from a secret store; there is no default password.</summary>
    public string? Email { get; set; }
    public string? Password { get; set; }
}

public sealed class DataSeeder(
    AppDbContext db,
    UserManager<ApplicationUser> users,
    RoleManager<IdentityRole<Guid>> roles,
    IOptions<SeedOptions> seedOptions,
    IOptions<PlatformAdminOptions> adminOptions,
    TimeProvider clock,
    ILogger<DataSeeder> logger)
{
    public async Task SeedReferenceDataAsync(CancellationToken ct)
    {
        if (!await roles.RoleExistsAsync(AppRoles.PlatformAdmin))
            await roles.CreateAsync(new IdentityRole<Guid>(AppRoles.PlatformAdmin));

        // Plan catalogue (pricing hypotheses, configurable later). Upserted by code.
        var plans = new[]
        {
            new SubscriptionPlan { Code = "starter", Name = "Starter", MonthlyPrice = 19m, MaxLocations = 1, MaxProducts = 30, MaxStaff = 3, SortOrder = 1 },
            new SubscriptionPlan { Code = "business", Name = "Business", MonthlyPrice = 39m, MaxLocations = 1, MaxProducts = 150, MaxStaff = 10,
                ProductionPlanning = true, CsvExport = true, CustomBranding = true, EmailNotifications = true, SortOrder = 2 },
            new SubscriptionPlan { Code = "multi", Name = "Multi-Location", MonthlyPrice = 79m, MaxLocations = 5, MaxProducts = 500, MaxStaff = 40,
                ProductionPlanning = true, CsvExport = true, CustomBranding = true, EmailNotifications = true, SortOrder = 3 },
        };
        foreach (var plan in plans)
        {
            if (!await db.SubscriptionPlans.AnyAsync(p => p.Code == plan.Code, ct)) db.SubscriptionPlans.Add(plan);
        }
        await db.SaveChangesAsync(ct);

        var admin = adminOptions.Value;
        if (!string.IsNullOrWhiteSpace(admin.Email) && !string.IsNullOrWhiteSpace(admin.Password))
            await EnsureUserAsync(admin.Email, admin.Password, "Plattform", "Admin", platformAdmin: true);
    }

    public async Task SeedDemoDataAsync(CancellationToken ct)
    {
        var o = seedOptions.Value;
        if (!o.DemoData) return;
        if (string.IsNullOrWhiteSpace(o.DemoPassword))
        {
            logger.LogWarning("Seed:DemoData is enabled but Seed:DemoPassword is empty; demo data was not created.");
            return;
        }
        if (await db.Tenants.AnyAsync(t => t.Slug == "baeckerei-rheinblick", ct)) return;

        logger.LogInformation("Creating fictional development demo data.");
        var now = clock.GetUtcNow();
        var business = await db.SubscriptionPlans.FirstAsync(p => p.Code == "business", ct);
        var multi = await db.SubscriptionPlans.FirstAsync(p => p.Code == "multi", ct);

        var owner = await EnsureUserAsync("inhaber@rheinblick.example", o.DemoPassword, "Clara", "Brandt", false);
        var manager = await EnsureUserAsync("leitung@rheinblick.example", o.DemoPassword, "Jonas", "Weber", false);
        var staff = await EnsureUserAsync("team@rheinblick.example", o.DemoPassword, "Mia", "Hoffmann", false);
        var otherOwner = await EnsureUserAsync("inhaber@donut-atelier.example", o.DemoPassword, "Emre", "Kaya", false);
        await EnsureUserAsync("admin@backreserve.example", o.DemoPassword, "Plattform", "Admin", true);

        // ---------- Bäckerei Rheinblick ----------
        var tenant = NewTenant("Bäckerei Rheinblick", "baeckerei-rheinblick", business, now,
            "Familienbäckerei in der Düsseldorfer Altstadt. Jeden Morgen frisch: Donuts, Croissants und Kuchen aus eigener Backstube.");
        tenant.ContactEmail = "hallo@rheinblick.example";
        tenant.ContactPhone = "0211 1234567";
        tenant.BrandColor = "#B5562B";
        tenant.Settings.PickupInstructions = "Bitte an der Theke den Abholcode nennen – reservierte Ware liegt bereit.";
        db.Tenants.Add(tenant);

        var location = NewLocation(tenant.Id, "Düsseldorf Altstadt", "Am Rheinufer 7", "40213", "Düsseldorf", now);
        db.Locations.Add(location);
        db.PickupScheduleRules.AddRange(LocationService.DefaultRules(tenant.Id, location.Id));

        db.TenantMemberships.Add(new TenantMembership { TenantId = tenant.Id, UserId = owner.Id, Role = MembershipRole.Owner, CreatedAt = now });
        var managerMembership = new TenantMembership { TenantId = tenant.Id, UserId = manager.Id, Role = MembershipRole.Manager, CreatedAt = now };
        var staffMembership = new TenantMembership { TenantId = tenant.Id, UserId = staff.Id, Role = MembershipRole.Staff, CreatedAt = now };
        db.TenantMemberships.AddRange(managerMembership, staffMembership);
        db.LocationMemberships.Add(new LocationMembership { TenantId = tenant.Id, TenantMembershipId = managerMembership.Id, LocationId = location.Id });
        db.LocationMemberships.Add(new LocationMembership { TenantId = tenant.Id, TenantMembershipId = staffMembership.Id, LocationId = location.Id });

        var cDonuts = Category(tenant.Id, "Donuts", 1);
        var cCroissants = Category(tenant.Id, "Croissants", 2);
        var cKuchen = Category(tenant.Id, "Kuchen", 3);
        var cBoxen = Category(tenant.Id, "Frühstücksboxen", 4);
        db.ProductCategories.AddRange(cDonuts, cCroissants, cKuchen, cBoxen);

        var products = new[]
        {
            Product(tenant.Id, cDonuts.Id, "Classic Donut", "Fluffiger Hefeteig mit Zuckerglasur – unser Klassiker.", 1.90m, "classic-donut.svg", "Weizen (Gluten), Ei, Milch, Soja", 60, 1, now),
            Product(tenant.Id, cDonuts.Id, "Schoko-Donut", "Mit dunkler Schokoladenglasur und Schokostreuseln.", 2.20m, "schoko-donut.svg", "Weizen (Gluten), Ei, Milch, Soja", 45, 2, now),
            Product(tenant.Id, cCroissants.Id, "Buttercroissant", "Mit französischer Butter, 27 Schichten, goldbraun gebacken.", 1.80m, "buttercroissant.svg", "Weizen (Gluten), Milch", 50, 3, now),
            Product(tenant.Id, cCroissants.Id, "Vanille-Croissant", "Gefüllt mit Bourbon-Vanillecreme.", 2.40m, "vanille-croissant.svg", "Weizen (Gluten), Ei, Milch", 30, 4, now),
            Product(tenant.Id, cCroissants.Id, "Zimtschnecke", "Saftiger Hefeteig mit Zimt-Zucker-Füllung und Frischkäse-Topping.", 2.60m, "zimtschnecke.svg", "Weizen (Gluten), Ei, Milch", 25, 5, now),
            Product(tenant.Id, cKuchen.Id, "Schokoladenkuchen", "Ganzer Kuchen (ca. 26 cm), saftig mit Ganache. Vorlaufzeit 24 Stunden.", 24.90m, "schokoladenkuchen.svg", "Weizen (Gluten), Ei, Milch, Soja", 4, 6, now, leadTimeHours: 24),
            Product(tenant.Id, cBoxen.Id, "Frühstücksbox", "2 Croissants, 2 Brötchen, Butter, Marmelade und ein Classic Donut.", 9.90m, "fruehstuecksbox.svg", "Weizen (Gluten), Ei, Milch", 12, 7, now),
        };
        db.Products.AddRange(products);
        var draft = Product(tenant.Id, cKuchen.Id, "Kürbis-Cheesecake (Entwurf)", "Saisonales Produkt in Vorbereitung.", 3.50m, null, null, null, 8, now);
        draft.IsPublished = false;
        db.Products.Add(draft);

        var tz = PickupCalendar.ResolveTimeZone("Europe/Berlin");
        var today = PickupCalendar.LocalToday(now, tz);
        var inventories = new Dictionary<(Guid, DateOnly), DailyInventory>();
        for (var d = 0; d < 7; d++)
        {
            var date = today.AddDays(d);
            if (date.DayOfWeek == DayOfWeek.Sunday) continue;
            foreach (var p in products)
            {
                var factor = date.DayOfWeek == DayOfWeek.Saturday ? 1.3 : 1.0;
                var inv = new DailyInventory
                {
                    TenantId = tenant.Id, LocationId = location.Id, ProductId = p.Id, Date = date,
                    PlannedQuantity = (int)Math.Round((p.DefaultDailyQuantity ?? 10) * factor), SafetyBuffer = p.DefaultDailyQuantity >= 30 ? 2 : 0,
                    UpdatedAt = now,
                };
                inventories[(p.Id, date)] = inv;
                db.DailyInventories.Add(inv);
            }
        }

        // Fictional orders that keep inventory and slot counters consistent.
        var orderDate = NextOpenDay(today);
        var tomorrow = NextOpenDay(orderDate.AddDays(1));
        var demoOrders = new (DateOnly Date, TimeOnly Slot, string First, string Last, OrderStatus Status, (int Product, int Qty)[] Lines)[]
        {
            (orderDate, new(7, 30), "Lena", "Schneider", OrderStatus.Confirmed, [(0, 6), (1, 6)]),
            (orderDate, new(8, 0), "Tobias", "Klein", OrderStatus.Preparing, [(2, 4), (3, 2)]),
            (orderDate, new(8, 0), "Sofia", "Wagner", OrderStatus.ReadyForPickup, [(6, 2)]),
            (orderDate, new(9, 30), "Paul", "Becker", OrderStatus.Confirmed, [(4, 3), (0, 2)]),
            (orderDate, new(10, 0), "Hannah", "Fischer", OrderStatus.Cancelled, [(1, 4)]),
            (tomorrow, new(7, 0), "Felix", "Richter", OrderStatus.Confirmed, [(0, 12)]),
            (tomorrow, new(8, 30), "Anna", "Zimmermann", OrderStatus.Confirmed, [(5, 1), (2, 6)]),
            (tomorrow, new(11, 0), "David", "Neumann", OrderStatus.Confirmed, [(0, 20), (1, 18)]),
        };
        var slotCounters = new Dictionary<(DateOnly, TimeOnly), PickupSlotCounter>();
        var n = 0;
        foreach (var d in demoOrders)
        {
            n++;
            var customer = new CustomerContact
            {
                TenantId = tenant.Id, FirstName = d.First, LastName = d.Last, Email = $"{d.First.ToLowerInvariant()}.{d.Last.ToLowerInvariant()}@kunde.example",
                Phone = n % 2 == 0 ? $"0170 000{n:000}" : null, CreatedAt = now.AddHours(-n),
            };
            var order = new Order
            {
                TenantId = tenant.Id, LocationId = location.Id, PublicReference = Codes.NewPublicReference(),
                AccessTokenHash = Codes.Sha256(Codes.NewSecureToken()), CustomerContactId = customer.Id, PickupDate = d.Date,
                SlotStart = d.Slot, SlotEnd = d.Slot.AddMinutes(30),
                PickupStartUtc = PickupCalendar.ToUtc(d.Date, d.Slot, tz), PickupEndUtc = PickupCalendar.ToUtc(d.Date, d.Slot.AddMinutes(30), tz),
                Status = d.Status, Currency = "EUR", CreatedAt = now.AddHours(-n), UpdatedAt = now,
                CustomerNote = n == 1 ? "Bitte in zwei Tüten verpacken." : null,
            };
            var items = d.Lines.Select(l =>
            {
                var p = products[l.Product];
                var inv = inventories[(p.Id, d.Date)];
                if (d.Status != OrderStatus.Cancelled) inv.ReservedQuantity += l.Qty;
                return new OrderItem
                {
                    TenantId = tenant.Id, OrderId = order.Id, ProductId = p.Id, DailyInventoryId = inv.Id, ProductName = p.Name,
                    UnitPrice = p.BasePrice, Quantity = l.Qty, LineTotal = Codes.RoundMoney(p.BasePrice * l.Qty),
                };
            }).ToList();
            order.ItemCount = items.Sum(i => i.Quantity);
            order.Subtotal = order.Total = items.Sum(i => i.LineTotal);
            if (d.Status == OrderStatus.Cancelled)
            {
                order.CancelledAt = now.AddMinutes(-30);
                order.CancelledBy = CancellationActor.Customer;
            }
            else
            {
                if (!slotCounters.TryGetValue((d.Date, d.Slot), out var counter))
                {
                    counter = new PickupSlotCounter { TenantId = tenant.Id, LocationId = location.Id, Date = d.Date, SlotStart = d.Slot };
                    slotCounters[(d.Date, d.Slot)] = counter;
                    db.PickupSlotCounters.Add(counter);
                }
                counter.OrderCount++;
                counter.ItemCount += order.ItemCount;
            }
            if (d.Status is OrderStatus.Preparing or OrderStatus.ReadyForPickup) order.PreparingAt = now.AddMinutes(-20);
            if (d.Status == OrderStatus.ReadyForPickup) order.ReadyAt = now.AddMinutes(-5);

            db.CustomerContacts.Add(customer);
            db.Orders.Add(order);
            db.OrderItems.AddRange(items);
            db.OrderStatusHistory.Add(new OrderStatusHistory { TenantId = tenant.Id, OrderId = order.Id, ToStatus = OrderStatus.Confirmed, Actor = "Customer", CreatedAt = order.CreatedAt });
            if (d.Status != OrderStatus.Confirmed)
                db.OrderStatusHistory.Add(new OrderStatusHistory
                {
                    TenantId = tenant.Id, OrderId = order.Id, FromStatus = OrderStatus.Confirmed, ToStatus = d.Status,
                    Actor = d.Status == OrderStatus.Cancelled ? "Customer" : "Staff", ChangedByUserId = d.Status == OrderStatus.Cancelled ? null : staff.Id,
                    CreatedAt = now.AddMinutes(-5),
                });
            db.Notifications.Add(new Notification
            {
                TenantId = tenant.Id, LocationId = location.Id, OrderId = order.Id, Type = NotificationType.NewOrder,
                Message = $"Neue Reservierung {order.PublicReference}", CreatedAt = order.CreatedAt, ReadAt = n > 3 ? now : null,
            });
        }

        // ---------- Donut Atelier (second tenant for isolation checks) ----------
        var other = NewTenant("Donut Atelier", "donut-atelier", multi, now, "Handgemachte Donuts in Köln-Ehrenfeld.");
        db.Tenants.Add(other);
        var otherLocation = NewLocation(other.Id, "Köln Ehrenfeld", "Atelierstraße 3", "50823", "Köln", now);
        db.Locations.Add(otherLocation);
        db.PickupScheduleRules.AddRange(LocationService.DefaultRules(other.Id, otherLocation.Id));
        db.TenantMemberships.Add(new TenantMembership { TenantId = other.Id, UserId = otherOwner.Id, Role = MembershipRole.Owner, CreatedAt = now });
        var otherCat = Category(other.Id, "Donuts", 1);
        db.ProductCategories.Add(otherCat);
        var otherProducts = new[]
        {
            Product(other.Id, otherCat.Id, "Pistazien-Donut", "Mit Pistaziencreme gefüllt.", 3.20m, "schoko-donut.svg", "Weizen (Gluten), Ei, Milch, Pistazie", 30, 1, now),
            Product(other.Id, otherCat.Id, "Himbeer-Donut", "Mit Himbeerfüllung und Puderzucker.", 2.90m, "classic-donut.svg", "Weizen (Gluten), Ei, Milch", 30, 2, now),
        };
        db.Products.AddRange(otherProducts);
        for (var d = 0; d < 7; d++)
        {
            var date = today.AddDays(d);
            foreach (var p in otherProducts)
                db.DailyInventories.Add(new DailyInventory { TenantId = other.Id, LocationId = otherLocation.Id, ProductId = p.Id, Date = date, PlannedQuantity = 30, UpdatedAt = now });
        }

        await db.SaveChangesAsync(ct);
        logger.LogInformation("Demo data created: tenants 'baeckerei-rheinblick' and 'donut-atelier'.");
    }

    private static DateOnly NextOpenDay(DateOnly d) => d.DayOfWeek == DayOfWeek.Sunday ? d.AddDays(1) : d;

    private async Task<ApplicationUser> EnsureUserAsync(string email, string password, string first, string last, bool platformAdmin)
    {
        var user = await users.FindByEmailAsync(email);
        if (user is null)
        {
            user = new ApplicationUser { UserName = email, Email = email, EmailConfirmed = true, FirstName = first, LastName = last, CreatedAt = clock.GetUtcNow() };
            var result = await users.CreateAsync(user, password);
            if (!result.Succeeded)
                throw new InvalidOperationException("Seed user creation failed: " + string.Join(", ", result.Errors.Select(e => e.Code)));
        }
        if (platformAdmin && !await users.IsInRoleAsync(user, AppRoles.PlatformAdmin))
            await users.AddToRoleAsync(user, AppRoles.PlatformAdmin);
        return user;
    }

    private static Tenant NewTenant(string name, string slug, SubscriptionPlan plan, DateTimeOffset now, string description)
    {
        var t = new Tenant { Name = name, Slug = slug, Description = description, IsPublished = true, CreatedAt = now, UpdatedAt = now };
        t.Settings = new TenantSettings
        {
            TenantId = t.Id,
            CancellationPolicyText = "Stornierungen sind bis zum Vortag 18:00 Uhr kostenlos möglich.",
            AllergenDisclaimer = "Die Allergenangaben stammen von der Bäckerei. Spuren anderer Allergene können nicht ausgeschlossen werden.",
        };
        t.Subscription = new Subscription
        {
            TenantId = t.Id, PlanId = plan.Id, Status = SubscriptionStatus.Trial, TrialEndsAt = now.AddDays(30),
            BillingProvider = "None", CreatedAt = now, UpdatedAt = now,
        };
        return t;
    }

    private static BakeryLocation NewLocation(Guid tenantId, string name, string street, string zip, string city, DateTimeOffset now)
    {
        var l = new BakeryLocation { TenantId = tenantId, Name = name, Street = street, PostalCode = zip, City = city, Phone = "0211 1234567", CreatedAt = now, UpdatedAt = now };
        l.Settings = new LocationSettings { TenantId = tenantId, LocationId = l.Id, MinAdvanceMinutes = 30 };
        return l;
    }

    private static ProductCategory Category(Guid tenantId, string name, int sort) =>
        new() { TenantId = tenantId, Name = name, Slug = Codes.Slugify(name), SortOrder = sort };

    private static Product Product(Guid tenantId, Guid categoryId, string name, string description, decimal price, string? image,
        string? allergens, int? defaultQty, int sort, DateTimeOffset now, int leadTimeHours = 0) => new()
    {
        TenantId = tenantId, CategoryId = categoryId, Name = name, Slug = Codes.Slugify(name), Description = description, BasePrice = price,
        ImageUrl = image is null ? null : $"/media/demo/{image}", Allergens = allergens, IsPublished = true, DefaultDailyQuantity = defaultQty,
        SortOrder = sort, LeadTimeHours = leadTimeHours, CreatedAt = now, UpdatedAt = now,
        DietaryLabels = name.Contains("Croissant") ? "vegetarisch" : null,
    };
}
