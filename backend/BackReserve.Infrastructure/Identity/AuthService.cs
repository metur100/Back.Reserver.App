using System.Data;
using BackReserve.Application.Abstractions;
using BackReserve.Application.Common;
using BackReserve.Application.Contracts;
using BackReserve.Application.Locations;
using BackReserve.Application.Notifications;
using BackReserve.Application.Staff;
using BackReserve.Application.Subscriptions;
using BackReserve.Domain.Entities;
using BackReserve.Domain.Enums;
using BackReserve.Domain.Rules;
using BackReserve.Infrastructure.Persistence;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace BackReserve.Infrastructure.Identity;

public sealed class AuthOptions
{
    public const string Section = "Auth";
    public bool RequireConfirmedEmail { get; set; } = true;
    public string DefaultTrialPlanCode { get; set; } = "business";
    /// <summary>
    /// SameSite mode of the browser refresh cookie. "Strict" when web app and API share a site (recommended);
    /// "None" only when they are on different sites (e.g. github.io + runasp.net). CSRF protection then relies on the
    /// required X-Requested-With header plus the explicit CORS origin list.
    /// </summary>
    public string RefreshCookieSameSite { get; set; } = "Strict";
}

public sealed class AuthService(
    AppDbContext db,
    UserManager<ApplicationUser> users,
    TokenService tokens,
    IEmailOutbox outbox,
    IAuditLogger audit,
    IDbErrorClassifier dbErrors,
    IOptions<AuthOptions> authOptions,
    IOptions<BillingOptions> billingOptions,
    IOptions<AppUrlOptions> urls,
    TimeProvider clock,
    ILogger<AuthService> logger)
{
    public const string GenericRegistrationMessage =
        "Fast geschafft! Wir haben dir eine E-Mail geschickt. Bitte bestätige deine E-Mail-Adresse, um fortzufahren.";

    private string Web => urls.Value.WebBaseUrl.TrimEnd('/');

    private static readonly string[] ReservedSlugs = ["admin", "api", "app", "b", "login", "register", "www", "backreserve", "support", "hilfe"];

    /// <summary>
    /// Registers an owner account and a bakery tenant. The response is identical whether or not the email already exists,
    /// so the endpoint cannot be used to discover registered addresses; existing users get an informational email instead.
    /// </summary>
    public async Task<MessageResponse> RegisterBakeryAsync(RegisterBakeryRequest request, CancellationToken ct)
    {
        var email = request.Email.Trim();
        var existing = await users.FindByEmailAsync(email);
        if (existing is not null)
        {
            outbox.Enqueue(EmailTemplates.AccountAlreadyExists(existing.Email!, $"{Web}/login"));
            await db.SaveChangesAsync(ct);
            return new MessageResponse(GenericRegistrationMessage);
        }

        var slug = await ResolveSlugAsync(request.Slug, request.BakeryName, ct);
        var now = clock.GetUtcNow();
        var plan = await db.SubscriptionPlans.FirstOrDefaultAsync(p => p.Code == authOptions.Value.DefaultTrialPlanCode, ct)
            ?? await db.SubscriptionPlans.OrderBy(p => p.SortOrder).FirstAsync(ct);

        await using var tx = await db.Database.BeginTransactionAsync(IsolationLevel.ReadCommitted, ct);
        var user = new ApplicationUser
        {
            UserName = email, Email = email, FirstName = request.FirstName.Trim(), LastName = request.LastName.Trim(), CreatedAt = now,
        };
        var result = await users.CreateAsync(user, request.Password);
        if (!result.Succeeded)
        {
            if (result.Errors.Any(e => e.Code is "DuplicateEmail" or "DuplicateUserName"))
                return new MessageResponse(GenericRegistrationMessage); // concurrent registration with same email
            throw new BusinessRuleException("registration_failed", TranslateIdentityErrors(result));
        }

        var tenant = new Tenant { Name = request.BakeryName.Trim(), Slug = slug, IsPublished = false, CreatedAt = now, UpdatedAt = now };
        tenant.Settings = new TenantSettings
        {
            TenantId = tenant.Id,
            CancellationPolicyText = "Stornierungen sind bis zum Vortag 18:00 Uhr kostenlos möglich.",
            AllergenDisclaimer = "Die Angaben zu Allergenen werden von der Bäckerei bereitgestellt. Bei Fragen wende dich bitte direkt an das Team vor Ort.",
        };
        tenant.Subscription = new Subscription
        {
            TenantId = tenant.Id, PlanId = plan.Id, Status = SubscriptionStatus.Trial,
            TrialEndsAt = now.AddDays(billingOptions.Value.TrialDays), BillingProvider = billingOptions.Value.Provider,
            CreatedAt = now, UpdatedAt = now,
        };
        db.Tenants.Add(tenant);
        db.TenantMemberships.Add(new TenantMembership { TenantId = tenant.Id, UserId = user.Id, Role = MembershipRole.Owner, CreatedAt = now });
        audit.Log(tenant.Id, user.Id, "tenant.registered", nameof(Tenant), tenant.Id.ToString(), new { slug, plan = plan.Code });

        var token = await users.GenerateEmailConfirmationTokenAsync(user);
        outbox.Enqueue(EmailTemplates.ConfirmEmail(email, user.FirstName, ConfirmLink(user.Id, token)));
        try
        {
            await db.SaveChangesAsync(ct);
        }
        catch (Exception ex) when (dbErrors.IsUniqueViolation(ex, "IX_Tenants_Slug"))
        {
            throw new ConflictException("slug_taken", "Diese Adresse ist bereits vergeben. Bitte wähle eine andere.");
        }
        await tx.CommitAsync(ct);
        logger.LogInformation("Tenant {TenantId} registered.", tenant.Id);
        return new MessageResponse(GenericRegistrationMessage);
    }

    private string ConfirmLink(Guid userId, string token) =>
        $"{Web}/email-bestaetigen#uid={userId}&token={Uri.EscapeDataString(token)}";

    private async Task<string> ResolveSlugAsync(string? requested, string bakeryName, CancellationToken ct)
    {
        if (!string.IsNullOrWhiteSpace(requested))
        {
            var s = requested.Trim().ToLowerInvariant();
            if (ReservedSlugs.Contains(s) || await db.Tenants.AnyAsync(t => t.Slug == s, ct))
                throw new ConflictException("slug_taken", "Diese Adresse ist bereits vergeben. Bitte wähle eine andere.");
            return s;
        }
        var baseSlug = Codes.Slugify(bakeryName);
        if (baseSlug.Length < 3) baseSlug = "baeckerei";
        if (baseSlug.Length > 50) baseSlug = baseSlug[..50].Trim('-');
        var slug = baseSlug;
        for (var i = 2; ReservedSlugs.Contains(slug) || await db.Tenants.AnyAsync(t => t.Slug == slug, ct); i++)
            slug = $"{baseSlug}-{i}";
        return slug;
    }

    public async Task<MessageResponse> ConfirmEmailAsync(ConfirmEmailRequest request, CancellationToken ct)
    {
        var user = await users.FindByIdAsync(request.UserId.ToString());
        var invalid = new BusinessRuleException("invalid_token", "Der Bestätigungslink ist ungültig oder abgelaufen.");
        if (user is null) throw invalid;
        if (user.EmailConfirmed) return new MessageResponse("Deine E-Mail-Adresse ist bereits bestätigt.");
        var result = await users.ConfirmEmailAsync(user, request.Token);
        if (!result.Succeeded) throw invalid;
        return new MessageResponse("Danke! Deine E-Mail-Adresse ist bestätigt. Du kannst dich jetzt anmelden.");
    }

    public async Task<AuthResponse> LoginAsync(LoginRequest request, bool includeRefreshTokenInBody, CancellationToken ct)
    {
        var failure = new UnauthorizedAppException("E-Mail-Adresse oder Passwort ist falsch.", "invalid_credentials");
        var user = await users.FindByEmailAsync(request.Email.Trim());
        if (user is null)
        {
            // Equalise timing with the password check of an existing account.
            users.PasswordHasher.HashPassword(new ApplicationUser(), request.Password);
            throw failure;
        }
        if (await users.IsLockedOutAsync(user))
            throw new UnauthorizedAppException("Zu viele Fehlversuche. Bitte versuche es in einigen Minuten erneut.", "locked_out");
        if (!await users.CheckPasswordAsync(user, request.Password))
        {
            await users.AccessFailedAsync(user);
            throw failure;
        }
        if (authOptions.Value.RequireConfirmedEmail && !user.EmailConfirmed)
            throw new UnauthorizedAppException("Bitte bestätige zuerst deine E-Mail-Adresse. Wir haben dir dazu eine E-Mail geschickt.", "email_not_confirmed");

        await users.ResetAccessFailedCountAsync(user);
        return await IssueAsync(user, includeRefreshTokenInBody, ct);
    }

    public async Task<AuthResponse> RefreshAsync(string? refreshToken, bool includeRefreshTokenInBody, CancellationToken ct)
    {
        var invalid = new UnauthorizedAppException("Sitzung abgelaufen. Bitte melde dich erneut an.", "invalid_refresh_token");
        if (string.IsNullOrWhiteSpace(refreshToken) || refreshToken.Length > 128) throw invalid;
        var rotated = await tokens.RotateAsync(refreshToken, ct) ?? throw invalid;
        var user = await users.FindByIdAsync(rotated.UserId.ToString()) ?? throw invalid;
        if (await users.IsLockedOutAsync(user)) throw invalid;
        var isAdmin = await users.IsInRoleAsync(user, AppRoles.PlatformAdmin);
        var (access, expires) = tokens.CreateAccessToken(user, isAdmin);
        return new AuthResponse(access, expires, rotated.NewToken, await GetMeAsync(user.Id, ct));
    }

    public Task LogoutAsync(string? refreshToken, CancellationToken ct) =>
        string.IsNullOrWhiteSpace(refreshToken) ? Task.CompletedTask : tokens.RevokeAsync(refreshToken, ct);

    public async Task<MessageResponse> ForgotPasswordAsync(ForgotPasswordRequest request, CancellationToken ct)
    {
        var user = await users.FindByEmailAsync(request.Email.Trim());
        if (user is not null && user.EmailConfirmed)
        {
            var token = await users.GeneratePasswordResetTokenAsync(user);
            var link = $"{Web}/passwort-zuruecksetzen#email={Uri.EscapeDataString(user.Email!)}&token={Uri.EscapeDataString(token)}";
            outbox.Enqueue(EmailTemplates.ResetPassword(user.Email!, link));
            await db.SaveChangesAsync(ct);
        }
        return new MessageResponse("Falls ein Konto mit dieser E-Mail-Adresse existiert, haben wir dir einen Link zum Zurücksetzen geschickt.");
    }

    public async Task<MessageResponse> ResetPasswordAsync(ResetPasswordRequest request, CancellationToken ct)
    {
        var invalid = new BusinessRuleException("invalid_token", "Der Link ist ungültig oder abgelaufen. Bitte fordere einen neuen an.");
        var user = await users.FindByEmailAsync(request.Email.Trim()) ?? throw invalid;
        var result = await users.ResetPasswordAsync(user, request.Token, request.NewPassword);
        if (!result.Succeeded)
        {
            if (result.Errors.Any(e => e.Code == "InvalidToken")) throw invalid;
            throw new BusinessRuleException("invalid_password", TranslateIdentityErrors(result));
        }
        await tokens.RevokeAllAsync(user.Id, ct);
        await users.ResetAccessFailedCountAsync(user);
        await users.SetLockoutEndDateAsync(user, null);
        return new MessageResponse("Dein Passwort wurde geändert. Du kannst dich jetzt anmelden.");
    }

    private async Task<Invitation> LoadValidInvitationAsync(string token, CancellationToken ct)
    {
        var hash = Codes.Sha256(token);
        var invitation = await db.Invitations.AsNoTracking().Include(i => i.Tenant).FirstOrDefaultAsync(i => i.TokenHash == hash, ct);
        if (invitation is null || invitation.AcceptedAt is not null || invitation.RevokedAt is not null || invitation.ExpiresAt <= clock.GetUtcNow())
            throw new BusinessRuleException("invitation_invalid", "Diese Einladung ist ungültig, abgelaufen oder wurde bereits verwendet.");
        return invitation;
    }

    public async Task<InvitationInfoDto> GetInvitationAsync(string token, CancellationToken ct)
    {
        var invitation = await LoadValidInvitationAsync(token, ct);
        var exists = await users.FindByEmailAsync(invitation.Email) is not null;
        return new InvitationInfoDto(invitation.Tenant.Name, invitation.Email, invitation.Role, invitation.ExpiresAt, exists);
    }

    public async Task<AuthResponse> AcceptInvitationAsync(AcceptInvitationRequest request, bool includeRefreshTokenInBody, CancellationToken ct)
    {
        var invitation = await LoadValidInvitationAsync(request.Token, ct);
        var now = clock.GetUtcNow();

        await using var tx = await db.Database.BeginTransactionAsync(IsolationLevel.ReadCommitted, ct);
        // Single use, even under concurrent acceptance attempts.
        var claimed = await db.Invitations
            .Where(i => i.Id == invitation.Id && i.AcceptedAt == null && i.RevokedAt == null && i.ExpiresAt > now)
            .ExecuteUpdateAsync(s => s.SetProperty(i => i.AcceptedAt, now), ct);
        if (claimed == 0)
            throw new BusinessRuleException("invitation_invalid", "Diese Einladung ist ungültig, abgelaufen oder wurde bereits verwendet.");

        var user = await users.FindByEmailAsync(invitation.Email);
        if (user is not null)
        {
            if (!await users.CheckPasswordAsync(user, request.Password))
                throw new UnauthorizedAppException("Das Passwort für dein bestehendes Konto ist falsch.", "invalid_credentials");
        }
        else
        {
            if (string.IsNullOrWhiteSpace(request.FirstName) || string.IsNullOrWhiteSpace(request.LastName))
                throw new BusinessRuleException("name_required", "Bitte gib Vor- und Nachnamen an.");
            if (request.Password.Length < 10 || !request.Password.Any(char.IsLetter) || !request.Password.Any(char.IsDigit))
                throw new BusinessRuleException("weak_password", "Das Passwort muss mindestens 10 Zeichen lang sein und Buchstaben sowie Ziffern enthalten.");
            user = new ApplicationUser
            {
                UserName = invitation.Email, Email = invitation.Email, EmailConfirmed = true, // the token proves control of the mailbox
                FirstName = request.FirstName.Trim(), LastName = request.LastName.Trim(), CreatedAt = now,
            };
            var created = await users.CreateAsync(user, request.Password);
            if (!created.Succeeded) throw new BusinessRuleException("registration_failed", TranslateIdentityErrors(created));
        }

        var membership = await db.TenantMemberships.FirstOrDefaultAsync(m => m.TenantId == invitation.TenantId && m.UserId == user.Id, ct);
        if (membership is null)
        {
            membership = new TenantMembership
            {
                TenantId = invitation.TenantId, UserId = user.Id, Role = invitation.Role, CustomPermissions = invitation.CustomPermissions, CreatedAt = now,
            };
            db.TenantMemberships.Add(membership);
            var validLocations = await db.Locations.Where(l => l.TenantId == invitation.TenantId && invitation.GetLocationIds().Contains(l.Id))
                .Select(l => l.Id).ToListAsync(ct);
            foreach (var locationId in validLocations)
                db.LocationMemberships.Add(new LocationMembership { TenantId = invitation.TenantId, TenantMembershipId = membership.Id, LocationId = locationId });
        }
        audit.Log(invitation.TenantId, user.Id, "staff.invitation_accepted", nameof(Invitation), invitation.Id.ToString());
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
        return await IssueAsync(user, includeRefreshTokenInBody, ct);
    }

    private async Task<AuthResponse> IssueAsync(ApplicationUser user, bool includeRefreshTokenInBody, CancellationToken ct)
    {
        var isAdmin = await users.IsInRoleAsync(user, AppRoles.PlatformAdmin);
        var (access, expires) = tokens.CreateAccessToken(user, isAdmin);
        var refresh = await tokens.CreateRefreshTokenAsync(user.Id, ct);
        // The controller moves the refresh token into an HttpOnly cookie for browser clients.
        return new AuthResponse(access, expires, refresh, await GetMeAsync(user.Id, ct));
    }

    public async Task<MeDto> GetMeAsync(Guid userId, CancellationToken ct)
    {
        var user = await db.Users.AsNoTracking().FirstOrDefaultAsync(u => u.Id == userId, ct)
            ?? throw new UnauthorizedAppException();
        var isAdmin = await (from ur in db.UserRoles join r in db.Roles on ur.RoleId equals r.Id
                             where ur.UserId == userId && r.Name == AppRoles.PlatformAdmin select ur).AnyAsync(ct);
        var memberships = await db.TenantMemberships.AsNoTracking()
            .Where(m => m.UserId == userId && m.IsActive)
            .Select(m => new
            {
                m.TenantId, m.Tenant.Name, m.Tenant.Slug, m.Role, m.CustomPermissions, m.Tenant.Status,
                Locations = m.Locations.Select(l => l.LocationId).ToList(),
            })
            .ToListAsync(ct);
        return new MeDto(user.Id, user.Email ?? "", user.FirstName, user.LastName, isAdmin,
            memberships.Select(m => new MembershipDto(m.TenantId, m.Name, m.Slug, m.Role,
                StaffService.PermissionNames(RolePermissions.Effective(m.Role, m.CustomPermissions)),
                m.Role == MembershipRole.Owner ? null : m.Locations, m.Status)).ToList());
    }

    private static string TranslateIdentityErrors(IdentityResult result) =>
        string.Join(" ", result.Errors.Select(e => e.Code switch
        {
            "PasswordTooShort" => "Das Passwort ist zu kurz.",
            "PasswordRequiresDigit" => "Das Passwort muss eine Ziffer enthalten.",
            "PasswordRequiresLower" => "Das Passwort muss einen Kleinbuchstaben enthalten.",
            "InvalidEmail" => "Die E-Mail-Adresse ist ungültig.",
            "DuplicateEmail" or "DuplicateUserName" => "Die Registrierung konnte nicht abgeschlossen werden.",
            _ => "Die Anfrage konnte nicht verarbeitet werden.",
        }).Distinct());
}
