using System;
using System.Threading.Tasks;
using MailKit.Net.Smtp;
using MailKit.Security;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using MimeKit;
using MimeKit.Text;
using OpenMeet.Application.Common.Interfaces;

namespace OpenMeet.Infrastructure.Services;

public class EmailSettings
{
    public string Host { get; set; } = string.Empty;
    public int Port { get; set; }
    public string Username { get; set; } = string.Empty;
    public string Password { get; set; } = string.Empty;
    public string SenderEmail { get; set; } = string.Empty;
    public string SenderName { get; set; } = string.Empty;
}

public class SmtpEmailService : IEmailService
{
    private readonly EmailSettings _settings;
    private readonly ILogger<SmtpEmailService> _logger;

    public SmtpEmailService(IOptions<EmailSettings> settings, ILogger<SmtpEmailService> logger)
    {
        _settings = settings.Value;
        _logger = logger;
    }

    public async Task SendEmailAsync(string to, string subject, string body)
    {
        try
        {
            var email = new MimeMessage();
            email.From.Add(new MailboxAddress(_settings.SenderName, _settings.SenderEmail));
            email.To.Add(MailboxAddress.Parse(to));
            email.Subject = subject;
            email.Body = new TextPart(TextFormat.Html) { Text = body };

            using var smtp = new SmtpClient();
            
            // Avoid SSL certificate validation issues in local environments
            smtp.ServerCertificateValidationCallback = (s, c, h, e) => true;
            
            // Connect using STARTTLS security (best for port 587)
            await smtp.ConnectAsync(_settings.Host, _settings.Port, SecureSocketOptions.StartTls);
            
            // Authenticate with mail server
            await smtp.AuthenticateAsync(_settings.Username, _settings.Password);
            
            // Transmit email
            await smtp.SendAsync(email);
            
            // Clean shutdown
            await smtp.DisconnectAsync(true);

            _logger.LogInformation("Email successfully dispatched to {To} via SMTP.", to);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "SMTP dispatch failure to {To}.", to);
            throw new InvalidOperationException($"Email dispatch failed: {ex.Message}", ex);
        }
    }
}
