using System.IO;
using System.Threading;
using System.Threading.Tasks;

namespace OpenMeet.Application.Common.Interfaces;

public interface IStorageService
{
    Task<string> UploadFileAsync(Stream fileStream, string fileName, string contentType, CancellationToken cancellationToken = default);
}
