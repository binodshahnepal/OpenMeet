using System;
using System.Security.Cryptography;
using System.Threading;
using System.Threading.Tasks;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;
using OpenMeet.Application.Common.Interfaces;
using OpenMeet.Application.Common.Security;
using OpenMeet.Domain.Entities;

namespace OpenMeet.Application.Auth.Commands;

public record RegisterUserResult(Guid Id, string VerificationCode);

public record RegisterUserCommand(string Email, string Password, string FullName) : IRequest<RegisterUserResult>;

public class RegisterUserCommandValidator : AbstractValidator<RegisterUserCommand>
{
    public RegisterUserCommandValidator()
    {
        RuleFor(v => v.Email)
            .NotEmpty().WithMessage("Email is required.")
            .EmailAddress().WithMessage("A valid email address is required.");

        RuleFor(v => v.Password)
            .NotEmpty().WithMessage("Password is required.")
            .MinimumLength(6).WithMessage("Password must be at least 6 characters long.");

        RuleFor(v => v.FullName)
            .NotEmpty().WithMessage("Full name is required.")
            .MaximumLength(100).WithMessage("Full name must not exceed 100 characters.");
    }
}

public class RegisterUserCommandHandler : IRequestHandler<RegisterUserCommand, RegisterUserResult>
{
    private readonly IApplicationDbContext _context;
    private readonly IEmailService _emailService;

    public RegisterUserCommandHandler(IApplicationDbContext context, IEmailService emailService)
    {
        _context = context;
        _emailService = emailService;
    }

    public async Task<RegisterUserResult> Handle(RegisterUserCommand request, CancellationToken cancellationToken)
    {
        // Verify unique email (case-insensitive)
        var exists = await _context.Users
            .AnyAsync(u => u.Email.ToLower() == request.Email.ToLower(), cancellationToken);

        if (exists)
        {
            throw new InvalidOperationException("A user with this email address already exists.");
        }

        // Generate verification code (6-digit OTP)
        var code = RandomNumberGenerator.GetInt32(100000, 1000000).ToString("D6");

        var user = new User
        {
            Email = request.Email,
            PasswordHash = PasswordHasher.HashPassword(request.Password),
            FullName = request.FullName,
            Role = "User",
            IsMfaEnabled = false,
            IsEmailVerified = false,
            EmailVerificationCode = code,
            EmailVerificationCodeExpires = DateTime.UtcNow.AddMinutes(15)
        };

        var isRelational = _context is DbContext dbContext && dbContext.Database.ProviderName != "Microsoft.EntityFrameworkCore.InMemory";

        if (isRelational)
        {
            var relationalDb = (DbContext)_context;
            using var transaction = await relationalDb.Database.BeginTransactionAsync(cancellationToken);
            try
            {
                _context.Users.Add(user);
                await _context.SaveChangesAsync(cancellationToken);

                // Dispatch verification email
                var verificationUrl = $"http://localhost:4200/verify-email?email={Uri.EscapeDataString(user.Email)}&code={code}";
                var emailBody = $@"
                    <div style=""font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 12px; background-color: #ffffff;"">
                        <h2 style=""color: #3b0764; margin-bottom: 20px;"">Welcome to OpenMeet, {user.FullName}!</h2>
                        <p style=""color: #374151; font-size: 16px; line-height: 1.5;"">
                            Thank you for registering. Please verify your email address to activate your account.
                        </p>
                        <p style=""color: #374151; font-size: 16px;"">Your 6-digit verification code is:</p>
                        <div style=""font-size: 32px; font-weight: bold; letter-spacing: 6px; color: #a855f7; background-color: #f3e8ff; padding: 15px 30px; border-radius: 12px; display: inline-block; margin: 15px 0; border: 1px solid #e9d5ff;"">
                            {code}
                        </div>
                        <p style=""color: #6b7280; font-size: 14px; margin-top: 10px;"">
                            This code is valid for 15 minutes.
                        </p>
                        <p style=""color: #374151; font-size: 16px; margin-top: 25px;"">
                            Alternatively, you can verify automatically by clicking the button below:
                        </p>
                        <p style=""margin: 20px 0;"">
                            <a href=""{verificationUrl}"" style=""background-color: #a855f7; color: #ffffff; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: bold; display: inline-block;"">Verify Email Automatically</a>
                        </p>
                        <hr style=""border: 0; border-top: 1px solid #e5e7eb; margin: 30px 0;"" />
                        <p style=""color: #9ca3af; font-size: 12px; line-height: 1.5;"">
                            If you did not create an account on OpenMeet, please ignore this email.
                        </p>
                    </div>";

                await _emailService.SendEmailAsync(user.Email, "Verify your OpenMeet Account", emailBody);

                await transaction.CommitAsync(cancellationToken);
            }
            catch
            {
                await transaction.RollbackAsync(cancellationToken);
                throw;
            }
        }
        else
        {
            _context.Users.Add(user);
            await _context.SaveChangesAsync(cancellationToken);

            // Dispatch verification email
            var verificationUrl = $"http://localhost:4200/verify-email?email={Uri.EscapeDataString(user.Email)}&code={code}";
            var emailBody = $@"
                <div style=""font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 12px; background-color: #ffffff;"">
                    <h2 style=""color: #3b0764; margin-bottom: 20px;"">Welcome to OpenMeet, {user.FullName}!</h2>
                    <p style=""color: #374151; font-size: 16px; line-height: 1.5;"">
                        Thank you for registering. Please verify your email address to activate your account.
                    </p>
                    <p style=""color: #374151; font-size: 16px;"">Your 6-digit verification code is:</p>
                    <div style=""font-size: 32px; font-weight: bold; letter-spacing: 6px; color: #a855f7; background-color: #f3e8ff; padding: 15px 30px; border-radius: 12px; display: inline-block; margin: 15px 0; border: 1px solid #e9d5ff;"">
                        {code}
                    </div>
                    <p style=""color: #6b7280; font-size: 14px; margin-top: 10px;"">
                        This code is valid for 15 minutes.
                    </p>
                    <p style=""color: #374151; font-size: 16px; margin-top: 25px;"">
                        Alternatively, you can verify automatically by clicking the button below:
                    </p>
                    <p style=""margin: 20px 0;"">
                        <a href=""{verificationUrl}"" style=""background-color: #a855f7; color: #ffffff; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: bold; display: inline-block;"">Verify Email Automatically</a>
                    </p>
                    <hr style=""border: 0; border-top: 1px solid #e5e7eb; margin: 30px 0;"" />
                    <p style=""color: #9ca3af; font-size: 12px; line-height: 1.5;"">
                        If you did not create an account on OpenMeet, please ignore this email.
                    </p>
                </div>";

            await _emailService.SendEmailAsync(user.Email, "Verify your OpenMeet Account", emailBody);
        }

        return new RegisterUserResult(user.Id, code);
    }
}
