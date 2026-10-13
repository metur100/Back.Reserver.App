using System.Security.Cryptography;
using System.Text;

namespace BackReserve.Domain.Rules;

public static class Codes
{
    /// <summary>No 0/O, 1/I/L so references can be read out over the counter without confusion.</summary>
    public const string ReferenceAlphabet = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
    public const string ReferencePrefix = "BR-";
    public const int ReferenceLength = 6;

    /// <summary>Random reference like BR-7K4M9X (31^6 ≈ 887 million combinations). Uniqueness is enforced by a unique index.</summary>
    public static string NewPublicReference()
    {
        Span<char> chars = stackalloc char[ReferenceLength];
        for (var i = 0; i < chars.Length; i++)
            chars[i] = ReferenceAlphabet[RandomNumberGenerator.GetInt32(ReferenceAlphabet.Length)];
        return ReferencePrefix + new string(chars);
    }

    /// <summary>Normalises staff input such as "br 7k4m9x" or "7K4M9X" to "BR-7K4M9X".</summary>
    public static string NormalizeReference(string input)
    {
        var cleaned = new string(input.ToUpperInvariant().Where(char.IsLetterOrDigit).ToArray());
        if (cleaned.StartsWith("BR", StringComparison.Ordinal) && cleaned.Length == ReferenceLength + 2)
            cleaned = cleaned[2..];
        return ReferencePrefix + cleaned;
    }

    /// <summary>High-entropy (256 bit) URL-safe token for capability links and invitations.</summary>
    public static string NewSecureToken()
    {
        var bytes = RandomNumberGenerator.GetBytes(32);
        return Convert.ToBase64String(bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_');
    }

    public static string Sha256(string value) =>
        Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(value)));

    public static bool FixedTimeEqualsHash(string rawToken, string expectedHash) =>
        CryptographicOperations.FixedTimeEquals(
            Encoding.ASCII.GetBytes(Sha256(rawToken)), Encoding.ASCII.GetBytes(expectedHash));

    public static decimal RoundMoney(decimal value) => Math.Round(value, 2, MidpointRounding.AwayFromZero);

    public static string Slugify(string input)
    {
        var s = input.Trim().ToLowerInvariant()
            .Replace("ä", "ae").Replace("ö", "oe").Replace("ü", "ue").Replace("ß", "ss")
            .Replace("č", "c").Replace("ć", "c").Replace("š", "s").Replace("ž", "z").Replace("đ", "dj");
        var sb = new StringBuilder();
        var lastDash = false;
        foreach (var c in s.Normalize(NormalizationForm.FormD))
        {
            if (c is >= 'a' and <= 'z' or >= '0' and <= '9') { sb.Append(c); lastDash = false; }
            else if (char.GetUnicodeCategory(c) == System.Globalization.UnicodeCategory.NonSpacingMark) { }
            else if (!lastDash && sb.Length > 0) { sb.Append('-'); lastDash = true; }
        }
        return sb.ToString().Trim('-');
    }
}
