using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using OpenMeet.Application.Common.Interfaces;
using OpenMeet.Infrastructure.Persistence;
using OpenMeet.Infrastructure.Services;

namespace OpenMeet.Infrastructure;

public static class DependencyInjection
{
    public static IServiceCollection AddInfrastructureServices(this IServiceCollection services, IConfiguration configuration)
    {
        var connectionString = configuration.GetConnectionString("DefaultConnection");

        services.AddDbContext<ApplicationDbContext>((sp, options) =>
        {
            options.UseSqlite(connectionString);
        });

        services.AddScoped<IApplicationDbContext>(provider => provider.GetRequiredService<ApplicationDbContext>());
        
        var emailSection = configuration.GetSection("EmailSettings");
        var emailSettings = new EmailSettings
        {
            Host = emailSection["Host"] ?? "",
            Port = int.TryParse(emailSection["Port"], out var p) ? p : 587,
            Username = emailSection["Username"] ?? "",
            Password = emailSection["Password"] ?? "",
            SenderEmail = emailSection["SenderEmail"] ?? "",
            SenderName = emailSection["SenderName"] ?? ""
        };

        services.AddSingleton(Microsoft.Extensions.Options.Options.Create(emailSettings));

        if (!string.IsNullOrEmpty(emailSettings.Host) && !emailSettings.Host.Contains("placeholder"))
        {
            services.AddTransient<IEmailService, SmtpEmailService>();
        }
        else
        {
            services.AddTransient<IEmailService, ConsoleEmailService>();
        }

        return services;
    }
}
