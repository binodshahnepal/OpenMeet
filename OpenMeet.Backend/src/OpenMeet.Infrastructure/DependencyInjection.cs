using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using OpenMeet.Application.Common.Interfaces;
using OpenMeet.Infrastructure.Persistence;
using OpenMeet.Infrastructure.Security;
using OpenMeet.Infrastructure.Services;

namespace OpenMeet.Infrastructure;

public static class DependencyInjection
{
    public static IServiceCollection AddInfrastructureServices(this IServiceCollection services, IConfiguration configuration)
    {
        var connectionString = configuration.GetConnectionString("DefaultConnection");
        var provider = configuration["Database:Provider"] ?? "PostgreSql";

        services.AddDbContext<ApplicationDbContext>((sp, options) =>
        {
            if (provider.Equals("Sqlite", StringComparison.OrdinalIgnoreCase))
            {
                options.UseSqlite(connectionString);
            }
            else
            {
                options.UseNpgsql(connectionString);
            }
        });

        services.AddScoped<IApplicationDbContext>(provider => provider.GetRequiredService<ApplicationDbContext>());
        
        // JWT configuration and DI registration
        var jwtSection = configuration.GetSection("JwtSettings");
        var jwtSettings = new JwtSettings
        {
            Secret = jwtSection["Secret"] ?? "",
            Issuer = jwtSection["Issuer"] ?? "",
            Audience = jwtSection["Audience"] ?? "",
            ExpiryMinutes = int.TryParse(jwtSection["ExpiryMinutes"], out var exp) ? exp : 60
        };
        services.AddSingleton(Microsoft.Extensions.Options.Options.Create(jwtSettings));
        services.AddTransient<IJwtTokenGenerator, JwtTokenGenerator>();
        services.AddTransient<IOtpService, OtpService>();
        services.AddTransient<IStorageService, StorageService>();

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

        if (!string.IsNullOrEmpty(emailSettings.Host) &&
            !string.IsNullOrEmpty(emailSettings.Username) &&
            !string.IsNullOrEmpty(emailSettings.Password) &&
            !emailSettings.Host.Contains("placeholder", StringComparison.OrdinalIgnoreCase))
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
