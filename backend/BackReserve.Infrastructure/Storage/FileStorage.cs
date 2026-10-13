using BackReserve.Application.Abstractions;
using BackReserve.Application.Common;
using Microsoft.Extensions.Options;

namespace BackReserve.Infrastructure.Storage;

public sealed class StorageOptions
{
    public const string Section = "Storage";
    /// <summary>"Local" (default). An S3-compatible provider such as Cloudflare R2 can be added behind <see cref="IFileStorage"/>.</summary>
    public string Provider { get; set; } = "Local";
    public string LocalPath { get; set; } = "App_Data/uploads";
    public string PublicPathPrefix { get; set; } = "/media/uploads";
    public long MaxImageBytes { get; set; } = 5 * 1024 * 1024;
}

/// <summary>Stores files under random server-generated names in a directory that is served as static, non-executable content.</summary>
public sealed class LocalFileStorage(IOptions<StorageOptions> options, Microsoft.Extensions.Hosting.IHostEnvironment env) : IFileStorage
{
    /// <summary>Relative paths are resolved against the content root (the working directory differs under IIS).</summary>
    public string RootPath => Path.GetFullPath(options.Value.LocalPath, env.ContentRootPath);

    public async Task<string> SaveAsync(Stream content, string extension, string contentType, CancellationToken ct)
    {
        if (extension is not (".jpg" or ".png" or ".webp")) throw new ArgumentException("Unsupported extension", nameof(extension));
        Directory.CreateDirectory(RootPath);
        var name = $"{Guid.NewGuid():N}{extension}";
        var full = Path.GetFullPath(Path.Combine(RootPath, name));
        if (!full.StartsWith(RootPath, StringComparison.Ordinal)) throw new InvalidOperationException("Path traversal detected.");
        await using var file = new FileStream(full, FileMode.CreateNew, FileAccess.Write, FileShare.None);
        await content.CopyToAsync(file, ct);
        return $"{options.Value.PublicPathPrefix.TrimEnd('/')}/{name}";
    }
}

public static class ImageValidator
{
    /// <summary>Determines the image type from its magic bytes (never from the file name or client content type).</summary>
    public static (string Extension, string ContentType) Detect(ReadOnlySpan<byte> header)
    {
        if (header.Length >= 3 && header[0] == 0xFF && header[1] == 0xD8 && header[2] == 0xFF) return (".jpg", "image/jpeg");
        if (header.Length >= 8 && header[..8].SequenceEqual(new byte[] { 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A })) return (".png", "image/png");
        if (header.Length >= 12 && header[..4].SequenceEqual("RIFF"u8) && header[8..12].SequenceEqual("WEBP"u8)) return (".webp", "image/webp");
        throw new BusinessRuleException("invalid_image", "Bitte ein Bild im Format JPEG, PNG oder WebP hochladen.");
    }
}
