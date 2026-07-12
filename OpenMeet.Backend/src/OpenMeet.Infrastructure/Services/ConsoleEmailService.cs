using System;
using System.Threading.Tasks;
using Microsoft.Extensions.Logging;
using OpenMeet.Application.Common.Interfaces;

namespace OpenMeet.Infrastructure.Services;

public class ConsoleEmailService : IEmailService
{
    private readonly ILogger<ConsoleEmailService> _logger;

    public ConsoleEmailService(ILogger<ConsoleEmailService> logger)
    {
        _logger = logger;
    }

    public Task SendEmailAsync(string to, string subject, string body)
    {
        _logger.LogInformation(
            "\n==================================================\n" +
            "*** OUTGOING EMAIL MOCK ***\n" +
            "To: {To}\n" +
            "Subject: {Subject}\n" +
            "Body:\n{Body}\n" +
            "==================================================",
            to, subject, body);

        return Task.CompletedTask;
    }
}
