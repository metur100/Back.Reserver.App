using BackReserve.Application.Catalog;
using BackReserve.Application.Common;
using BackReserve.Application.Contracts;
using BackReserve.Application.Reporting;
using BackReserve.Domain.Common;
using BackReserve.Domain.Entities;
using BackReserve.Domain.Enums;
using BackReserve.Domain.Rules;
using BackReserve.Infrastructure.Storage;

namespace BackReserve.Tests.Domain;

public class OrderStateMachineTests
{
    [Theory]
    [InlineData(OrderStatus.Confirmed, OrderStatus.Preparing)]
    [InlineData(OrderStatus.Confirmed, OrderStatus.Collected)]
    [InlineData(OrderStatus.Preparing, OrderStatus.ReadyForPickup)]
    [InlineData(OrderStatus.ReadyForPickup, OrderStatus.Collected)]
    [InlineData(OrderStatus.ReadyForPickup, OrderStatus.Cancelled)]
    [InlineData(OrderStatus.Preparing, OrderStatus.NoShow)]
    public void Allows_valid_transitions(OrderStatus from, OrderStatus to) => Assert.True(OrderStateMachine.CanTransition(from, to));

    [Theory]
    [InlineData(OrderStatus.Collected, OrderStatus.Collected, "order_already_collected")]
    [InlineData(OrderStatus.Cancelled, OrderStatus.Collected, "order_cancelled")]
    [InlineData(OrderStatus.Cancelled, OrderStatus.Cancelled, "order_already_cancelled")]
    [InlineData(OrderStatus.Collected, OrderStatus.Cancelled, "order_already_collected")]
    [InlineData(OrderStatus.ReadyForPickup, OrderStatus.Preparing, "invalid_status_transition")]
    [InlineData(OrderStatus.NoShow, OrderStatus.Collected, "invalid_status_transition")]
    public void Rejects_invalid_transitions_with_specific_codes(OrderStatus from, OrderStatus to, string code)
    {
        var ex = Assert.Throws<DomainException>(() => OrderStateMachine.EnsureCanTransition(from, to));
        Assert.Equal(code, ex.Code);
    }

    [Fact]
    public void Only_open_states_hold_stock()
    {
        Assert.True(OrderStateMachine.IsActive(OrderStatus.Confirmed));
        Assert.True(OrderStateMachine.IsActive(OrderStatus.Preparing));
        Assert.True(OrderStateMachine.IsActive(OrderStatus.ReadyForPickup));
        Assert.False(OrderStateMachine.IsActive(OrderStatus.Collected));
        Assert.False(OrderStateMachine.IsActive(OrderStatus.Cancelled));
        Assert.False(OrderStateMachine.IsActive(OrderStatus.NoShow));
    }
}

public class CodesTests
{
    [Fact]
    public void Public_reference_has_expected_format_and_unambiguous_alphabet()
    {
        for (var i = 0; i < 500; i++)
        {
            var reference = Codes.NewPublicReference();
            Assert.Matches("^BR-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{6}$", reference);
        }
    }

    [Fact]
    public void Public_references_are_practically_unique()
    {
        var set = Enumerable.Range(0, 20_000).Select(_ => Codes.NewPublicReference()).ToHashSet();
        Assert.True(set.Count >= 19_990); // 31^6 space; collisions handled by a unique index + retry
    }

    [Theory]
    [InlineData("BR-7K4M9X", "BR-7K4M9X")]
    [InlineData("br 7k4m9x", "BR-7K4M9X")]
    [InlineData("7k4m9x", "BR-7K4M9X")]
    [InlineData(" BR7K4M9X ", "BR-7K4M9X")]
    public void Normalizes_staff_input(string input, string expected) => Assert.Equal(expected, Codes.NormalizeReference(input));

    [Fact]
    public void Secure_tokens_are_long_url_safe_and_random()
    {
        var a = Codes.NewSecureToken();
        var b = Codes.NewSecureToken();
        Assert.NotEqual(a, b);
        Assert.True(a.Length >= 43);
        Assert.Matches("^[A-Za-z0-9_-]+$", a);
    }

    [Fact]
    public void Token_hash_comparison()
    {
        var token = Codes.NewSecureToken();
        var hash = Codes.Sha256(token);
        Assert.True(Codes.FixedTimeEqualsHash(token, hash));
        Assert.False(Codes.FixedTimeEqualsHash(token + "x", hash));
    }

    [Theory]
    [InlineData("Bäckerei Müller", "baeckerei-mueller")]
    [InlineData("  Konditorei  Rheinblick!! ", "konditorei-rheinblick")]
    [InlineData("Pekara Đurić", "pekara-djuric")]
    [InlineData("Café Crème", "cafe-creme")]
    public void Slugify_handles_german_and_bcs_characters(string input, string expected) => Assert.Equal(expected, Codes.Slugify(input));

    [Theory]
    [InlineData(1.005, 1.01)]
    [InlineData(2.675, 2.68)]
    [InlineData(3.1, 3.10)]
    public void Money_rounding_is_away_from_zero(decimal input, decimal expected) => Assert.Equal(expected, Codes.RoundMoney(input));

    [Fact]
    public void Line_totals_use_exact_decimal_arithmetic()
    {
        // 0.1 + 0.2 style floating point errors must not occur.
        var total = Codes.RoundMoney(1.90m * 3) + Codes.RoundMoney(2.20m * 7);
        Assert.Equal(21.10m, total);
    }
}

public class PermissionTests
{
    [Fact]
    public void Owner_has_everything()
    {
        Assert.Equal(RolePermissions.OwnerAll, RolePermissions.Effective(MembershipRole.Owner, Permission.None));
    }

    [Fact]
    public void Manager_never_gets_subscription_or_staff_management()
    {
        var p = RolePermissions.Effective(MembershipRole.Manager, RolePermissions.OwnerAll);
        Assert.False(p.HasFlag(Permission.SubscriptionManage));
        Assert.False(p.HasFlag(Permission.StaffManage));
        Assert.False(p.HasFlag(Permission.SettingsManage));
        Assert.True(p.HasFlag(Permission.InventoryManage));
    }

    [Fact]
    public void Staff_custom_permissions_are_capped_by_role_ceiling()
    {
        var p = RolePermissions.Effective(MembershipRole.Staff, Permission.ProductsManage | Permission.PickupCollect);
        Assert.Equal(Permission.PickupCollect, p);
        Assert.Equal(RolePermissions.StaffDefault, RolePermissions.Effective(MembershipRole.Staff, null));
    }

    [Fact]
    public void Admin_context_enforces_permissions_and_locations()
    {
        var allowed = Guid.NewGuid();
        var ctx = new AdminContext
        {
            UserId = Guid.NewGuid(), TenantId = Guid.NewGuid(), MembershipId = Guid.NewGuid(), Role = MembershipRole.Staff,
            Permissions = RolePermissions.StaffDefault, LocationIds = new HashSet<Guid> { allowed }, IsReadOnly = false,
        };
        ctx.Require(Permission.PickupCollect);
        Assert.Throws<ForbiddenException>(() => ctx.Require(Permission.ProductsManage));
        ctx.EnsureLocation(allowed);
        Assert.Throws<ForbiddenException>(() => ctx.EnsureLocation(Guid.NewGuid()));
    }
}

public class InventoryModelTests
{
    [Fact]
    public void Remaining_accounts_for_buffer_reserved_collected_and_noshow()
    {
        var inv = new DailyInventory { PlannedQuantity = 60, SafetyBuffer = 2, ReservedQuantity = 30, CollectedQuantity = 8, NoShowQuantity = 1 };
        Assert.Equal(58, inv.MaxSellable);
        Assert.Equal(39, inv.Committed);
        Assert.Equal(19, inv.Remaining);
    }

    [Fact]
    public void Unavailable_product_has_zero_remaining_but_keeps_commitments()
    {
        var inv = new DailyInventory { PlannedQuantity = 10, ReservedQuantity = 4, IsUnavailable = true };
        Assert.Equal(0, inv.Remaining);
        Assert.Equal(4, inv.Committed);
    }

    [Theory]
    [InlineData(0, 40, AvailabilityStatus.SoldOut)]
    [InlineData(3, 40, AvailabilityStatus.Low)]
    [InlineData(8, 40, AvailabilityStatus.Low)]
    [InlineData(9, 40, AvailabilityStatus.Available)]
    [InlineData(3, 10, AvailabilityStatus.Low)]
    public void Availability_status_thresholds(int remaining, int max, AvailabilityStatus expected) =>
        Assert.Equal(expected, StockLevels.Status(remaining, max));
}

public class CsvTests
{
    [Theory]
    [InlineData("=HYPERLINK(\"http://x\")", "\"'=HYPERLINK(\"\"http://x\"\")\"")]
    [InlineData("+SUM(A1)", "'+SUM(A1)")]
    [InlineData("@cmd", "'@cmd")]
    [InlineData("-2+3", "'-2+3")]
    [InlineData("-12,50", "\"-12,50\"")]
    [InlineData("Classic Donut", "Classic Donut")]
    [InlineData("Brot; groß", "\"Brot; groß\"")]
    public void Escapes_formula_injection_and_separators(string input, string expected) => Assert.Equal(expected, Csv.Escape(input));

    [Fact]
    public void Output_has_bom_and_crlf()
    {
        var bytes = Csv.Build([["A", "B"], ["1", "2"]]);
        Assert.Equal(new byte[] { 0xEF, 0xBB, 0xBF }, bytes[..3]);
        Assert.EndsWith("A;B\r\n1;2\r\n", System.Text.Encoding.UTF8.GetString(bytes[3..]));
    }
}

public class ImageValidatorTests
{
    [Fact]
    public void Detects_types_from_magic_bytes()
    {
        Assert.Equal(".jpg", ImageValidator.Detect([0xFF, 0xD8, 0xFF, 0xE0]).Extension);
        Assert.Equal(".png", ImageValidator.Detect([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0, 0]).Extension);
        Assert.Equal(".webp", ImageValidator.Detect("RIFF\0\0\0\0WEBPVP8 "u8.ToArray()).Extension);
    }

    [Fact]
    public void Rejects_svg_html_and_executables_regardless_of_name()
    {
        Assert.Throws<BusinessRuleException>(() => ImageValidator.Detect("<svg xmlns="u8.ToArray()));
        Assert.Throws<BusinessRuleException>(() => ImageValidator.Detect("<html><script>"u8.ToArray()));
        Assert.Throws<BusinessRuleException>(() => ImageValidator.Detect("MZ\x90\0"u8.ToArray()));
    }
}
