using System;
using System.IO;
using System.Threading;
using System.Threading.Tasks;
using Amazon.S3;
using Amazon.S3.Transfer;
using Microsoft.Extensions.Configuration;
using OpenMeet.Application.Common.Interfaces;

namespace OpenMeet.Infrastructure.Services;

public class StorageService : IStorageService
{
    private readonly IConfiguration _configuration;

    public StorageService(IConfiguration configuration)
    {
        _configuration = configuration;
    }

    public async Task<string> UploadFileAsync(Stream fileStream, string fileName, string contentType, CancellationToken cancellationToken = default)
    {
        try
        {
            var storageSection = _configuration.GetSection("Storage");
            var serviceUrl = storageSection["ServiceUrl"] ?? "http://localhost:9000";
            var accessKey = storageSection["AccessKey"] ?? "";
            var secretKey = storageSection["SecretKey"] ?? "";
            var bucketName = storageSection["BucketName"] ?? "openmeet-avatars";

            if (string.IsNullOrWhiteSpace(accessKey) || string.IsNullOrWhiteSpace(secretKey))
            {
                throw new InvalidOperationException("S3-compatible storage credentials are not configured.");
            }

            var s3Config = new AmazonS3Config
            {
                ServiceURL = serviceUrl,
                ForcePathStyle = true
            };

            using var client = new AmazonS3Client(accessKey, secretKey, s3Config);

            var bucketExists = await Amazon.S3.Util.AmazonS3Util.DoesS3BucketExistV2Async(client, bucketName);
            if (!bucketExists)
            {
                await client.PutBucketAsync(new Amazon.S3.Model.PutBucketRequest { BucketName = bucketName }, cancellationToken);
            }

            var fileTransferUtility = new TransferUtility(client);
            var uniqueFileName = $"{Guid.NewGuid()}_{Path.GetFileName(fileName)}";

            var uploadRequest = new TransferUtilityUploadRequest
            {
                InputStream = fileStream,
                Key = uniqueFileName,
                BucketName = bucketName,
                ContentType = contentType,
                CannedACL = S3CannedACL.PublicRead
            };

            await fileTransferUtility.UploadAsync(uploadRequest, cancellationToken);

            return $"{serviceUrl.TrimEnd('/')}/{bucketName}/{uniqueFileName}";
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[StorageService S3 ERROR]: {ex.Message}. Falling back to local storage.");
            
            var uploadsFolder = Path.Combine(Directory.GetCurrentDirectory(), "wwwroot", "uploads");
            if (!Directory.Exists(uploadsFolder))
            {
                Directory.CreateDirectory(uploadsFolder);
            }

            var uniqueFileName = $"{Guid.NewGuid()}_{Path.GetFileName(fileName)}";
            var filePath = Path.Combine(uploadsFolder, uniqueFileName);

            using (var outputStream = new FileStream(filePath, FileMode.Create))
            {
                await fileStream.CopyToAsync(outputStream, cancellationToken);
            }

            var publicBaseUrl = _configuration["PublicBaseUrl"] ?? "http://localhost:5148";
            return $"{publicBaseUrl.TrimEnd('/')}/uploads/{uniqueFileName}";
        }
    }
}
