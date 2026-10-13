using BackReserve.Application.Abstractions;
using BackReserve.Application.Common;
using BackReserve.Application.Contracts;
using BackReserve.Infrastructure.Identity;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.Extensions.Options;

namespace BackReserve.Api.Controllers;

/// <summary>
/// Browser clients receive the refresh token as an HttpOnly, Secure, SameSite=Strict cookie scoped to /api/v1/auth.
/// Native clients send "X-Client-Type: mobile" and receive it in the body to store in the OS keychain (SecureStore).
/// </summary>
[ApiController]
[Route("api/v1/auth")]
[EnableRateLimiting("auth")]
[Tags("Auth")]
public sealed class AuthController(
    AuthService auth, ICurrentUser currentUser, IOptions<JwtOptions> jwt, IOptions<AuthOptions> authOptions, IHostEnvironment env) : ControllerBase
{
    private const string RefreshCookie = "br_refresh";
    private const string CookiePath = "/api/v1/auth";

    private bool IsMobile => string.Equals(Request.Headers["X-Client-Type"], "mobile", StringComparison.OrdinalIgnoreCase);

    private AuthResponse Deliver(AuthResponse response)
    {
        if (IsMobile) return response;
        Response.Cookies.Append(RefreshCookie, response.RefreshToken!, CookieOptions(DateTimeOffset.UtcNow.AddDays(jwt.Value.RefreshTokenDays)));
        return response with { RefreshToken = null };
    }

    private CookieOptions CookieOptions(DateTimeOffset? expires = null)
    {
        var crossSite = string.Equals(authOptions.Value.RefreshCookieSameSite, "None", StringComparison.OrdinalIgnoreCase);
        return new CookieOptions
        {
            HttpOnly = true,
            // SameSite=None cookies are only accepted by browsers when Secure.
            Secure = crossSite || !env.IsDevelopment() || Request.IsHttps,
            SameSite = crossSite ? SameSiteMode.None : SameSiteMode.Strict,
            Path = CookiePath,
            Expires = expires,
        };
    }

    /// <summary>Cookie-based calls must carry a custom header, which cross-site forms cannot send (CSRF defence in depth).</summary>
    private string? ReadRefreshToken(RefreshRequest? body)
    {
        if (IsMobile) return body?.RefreshToken;
        if (!Request.Headers.ContainsKey("X-Requested-With"))
            throw new ForbiddenException("Fehlender Sicherheits-Header.", "csrf_header_missing");
        return Request.Cookies[RefreshCookie];
    }

    [HttpPost("register-bakery")]
    [ProducesResponseType<MessageResponse>(StatusCodes.Status202Accepted)]
    public async Task<IActionResult> Register(RegisterBakeryRequest request, CancellationToken ct) =>
        Accepted(await auth.RegisterBakeryAsync(request, ct));

    [HttpPost("confirm-email")]
    public Task<MessageResponse> ConfirmEmail(ConfirmEmailRequest request, CancellationToken ct) => auth.ConfirmEmailAsync(request, ct);

    [HttpPost("login")]
    public async Task<AuthResponse> Login(LoginRequest request, CancellationToken ct) => Deliver(await auth.LoginAsync(request, IsMobile, ct));

    [HttpPost("refresh")]
    public async Task<AuthResponse> Refresh([FromBody] RefreshRequest? request, CancellationToken ct) =>
        Deliver(await auth.RefreshAsync(ReadRefreshToken(request), IsMobile, ct));

    [HttpPost("logout")]
    public async Task<IActionResult> Logout([FromBody] RefreshRequest? request, CancellationToken ct)
    {
        await auth.LogoutAsync(IsMobile ? request?.RefreshToken : Request.Cookies[RefreshCookie], ct);
        Response.Cookies.Delete(RefreshCookie, CookieOptions());
        return NoContent();
    }

    [HttpPost("forgot-password")]
    [ProducesResponseType<MessageResponse>(StatusCodes.Status202Accepted)]
    public async Task<IActionResult> ForgotPassword(ForgotPasswordRequest request, CancellationToken ct) =>
        Accepted(await auth.ForgotPasswordAsync(request, ct));

    [HttpPost("reset-password")]
    public Task<MessageResponse> ResetPassword(ResetPasswordRequest request, CancellationToken ct) => auth.ResetPasswordAsync(request, ct);

    /// <summary>Invitation details for the acceptance page. The token is sent in the body, never in the URL.</summary>
    [HttpPost("invitations/inspect")]
    public Task<InvitationInfoDto> InspectInvitation(InspectInvitationRequest request, CancellationToken ct) =>
        auth.GetInvitationAsync(request.Token, ct);

    [HttpPost("invitations/accept")]
    public async Task<AuthResponse> AcceptInvitation(AcceptInvitationRequest request, CancellationToken ct) =>
        Deliver(await auth.AcceptInvitationAsync(request, IsMobile, ct));

    [Authorize]
    [HttpGet("me")]
    [DisableRateLimiting]
    public Task<MeDto> Me(CancellationToken ct) => auth.GetMeAsync(currentUser.UserId!.Value, ct);
}

public sealed record InspectInvitationRequest(string Token);
