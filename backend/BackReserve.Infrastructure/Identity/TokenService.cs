using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using BackReserve.Domain.Entities;
using BackReserve.Domain.Rules;
using BackReserve.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;

namespace BackReserve.Infrastructure.Identity;

public sealed class JwtOptions
{
    public const string Section = "Jwt";
    public string Issuer { get; set; } = "backreserve";
    public string Audience { get; set; } = "backreserve-clients";
    /// <summary>At least 32 bytes. Supplied via environment variable / secret store; never committed.</summary>
    public string SigningKey { get; set; } = "";
    public int AccessTokenMinutes { get; set; } = 15;
    public int RefreshTokenDays { get; set; } = 30;
}

public static class AppRoles
{
    public const string PlatformAdmin = "PlatformAdmin";
}

/// <remarks>Uses the real system clock on purpose: JWT validation is always performed against real time.</remarks>
public sealed class TokenService(AppDbContext db, IOptions<JwtOptions> options)
{
    private static readonly TimeProvider clock = TimeProvider.System;

    public static SymmetricSecurityKey Key(JwtOptions o)
    {
        if (Encoding.UTF8.GetByteCount(o.SigningKey) < 32)
            throw new InvalidOperationException("Jwt:SigningKey must be configured with at least 32 bytes.");
        return new SymmetricSecurityKey(Encoding.UTF8.GetBytes(o.SigningKey));
    }

    public (string Token, DateTimeOffset ExpiresAt) CreateAccessToken(ApplicationUser user, bool isPlatformAdmin)
    {
        var o = options.Value;
        var now = clock.GetUtcNow();
        var expires = now.AddMinutes(o.AccessTokenMinutes);
        var claims = new List<Claim>
        {
            new(JwtRegisteredClaimNames.Sub, user.Id.ToString()),
            new(JwtRegisteredClaimNames.Jti, Guid.NewGuid().ToString("N")),
            new("sst", user.SecurityStamp ?? ""),
        };
        if (isPlatformAdmin) claims.Add(new Claim(ClaimTypes.Role, AppRoles.PlatformAdmin));

        var token = new JwtSecurityToken(o.Issuer, o.Audience, claims, now.UtcDateTime, expires.UtcDateTime,
            new SigningCredentials(Key(o), SecurityAlgorithms.HmacSha256));
        return (new JwtSecurityTokenHandler().WriteToken(token), expires);
    }

    public async Task<string> CreateRefreshTokenAsync(Guid userId, CancellationToken ct)
    {
        var raw = Codes.NewSecureToken();
        var now = clock.GetUtcNow();
        db.RefreshTokens.Add(new RefreshToken
        {
            UserId = userId, TokenHash = Codes.Sha256(raw), CreatedAt = now, ExpiresAt = now.AddDays(options.Value.RefreshTokenDays),
        });
        await db.SaveChangesAsync(ct);
        return raw;
    }

    /// <summary>Rotates a refresh token. Presenting an already-rotated token revokes the whole token family (theft detection).</summary>
    public async Task<(Guid UserId, string NewToken)?> RotateAsync(string raw, CancellationToken ct)
    {
        var hash = Codes.Sha256(raw);
        var now = clock.GetUtcNow();
        var token = await db.RefreshTokens.FirstOrDefaultAsync(t => t.TokenHash == hash, ct);
        if (token is null) return null;
        if (token.RevokedAt is not null)
        {
            await db.RefreshTokens.Where(t => t.UserId == token.UserId && t.RevokedAt == null)
                .ExecuteUpdateAsync(s => s.SetProperty(t => t.RevokedAt, now), ct);
            return null;
        }
        if (token.ExpiresAt <= now) return null;

        // Conditional revoke so two parallel refreshes with the same token cannot both succeed.
        var newRaw = Codes.NewSecureToken();
        var replacement = new RefreshToken
        {
            UserId = token.UserId, TokenHash = Codes.Sha256(newRaw), CreatedAt = now, ExpiresAt = now.AddDays(options.Value.RefreshTokenDays),
        };
        var revoked = await db.RefreshTokens.Where(t => t.Id == token.Id && t.RevokedAt == null)
            .ExecuteUpdateAsync(s => s.SetProperty(t => t.RevokedAt, now).SetProperty(t => t.ReplacedByTokenId, replacement.Id), ct);
        if (revoked == 0) return null;
        db.RefreshTokens.Add(replacement);
        await db.SaveChangesAsync(ct);
        return (token.UserId, newRaw);
    }

    public async Task RevokeAsync(string raw, CancellationToken ct)
    {
        var hash = Codes.Sha256(raw);
        var now = clock.GetUtcNow();
        await db.RefreshTokens.Where(t => t.TokenHash == hash && t.RevokedAt == null)
            .ExecuteUpdateAsync(s => s.SetProperty(t => t.RevokedAt, now), ct);
    }

    public async Task RevokeAllAsync(Guid userId, CancellationToken ct)
    {
        var now = clock.GetUtcNow();
        await db.RefreshTokens.Where(t => t.UserId == userId && t.RevokedAt == null)
            .ExecuteUpdateAsync(s => s.SetProperty(t => t.RevokedAt, now), ct);
    }
}
