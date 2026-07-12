using System.Threading.Tasks;

namespace OpenMeet.Application.Common.Interfaces;

public interface IEmailService
{
    Task SendEmailAsync(string to, string subject, string body);
}
