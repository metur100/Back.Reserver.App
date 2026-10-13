using BackReserve.Domain.Enums;

namespace BackReserve.Application.Contracts;

public sealed record RegisterBakeryRequest(
    string FirstName,
    string LastName,
    string Email,
    string Password,
    string BakeryName,
    string? Slug,
    bool AcceptTerms);

public sealed record LoginRequest(string Email, string Password);

/// <summary>Mobile clients send the refresh token in the body; the web app uses an HttpOnly cookie instead.</summary>
public sealed record RefreshRequest(string? RefreshToken);

public sealed record ConfirmEmailRequest(Guid UserId, string Token);

public sealed record ForgotPasswordRequest(string Email);

public sealed record ResetPasswordRequest(string Email, string Token, string NewPassword);

public sealed record AcceptInvitationRequest(string Token, string? FirstName, string? LastName, string Password);

public sealed record InvitationInfoDto(string BakeryName, string Email, MembershipRole Role, DateTimeOffset ExpiresAt, bool AccountExists);

public sealed record MembershipDto(
    Guid TenantId, string TenantName, string TenantSlug, MembershipRole Role, IReadOnlyList<string> Permissions,
    IReadOnlyList<Guid>? LocationIds, TenantStatus TenantStatus);

public sealed record MeDto(Guid UserId, string Email, string FirstName, string LastName, bool IsPlatformAdmin, IReadOnlyList<MembershipDto> Memberships);

public sealed record AuthResponse(string AccessToken, DateTimeOffset AccessTokenExpiresAt, string? RefreshToken, MeDto User);

public sealed record MessageResponse(string Message);
