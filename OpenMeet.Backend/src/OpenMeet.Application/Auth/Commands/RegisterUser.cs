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

public record RegisterUserCommand(string Email, string Password, string FullName) : IRequest<Guid>;

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

public class RegisterUserCommandHandler : IRequestHandler<RegisterUserCommand, Guid>
{
    private readonly IApplicationDbContext _context;
    private readonly IEmailService _emailService;

    public RegisterUserCommandHandler(IApplicationDbContext context, IEmailService emailService)
    {
        _context = context;
        _emailService = emailService;
    }

    public async Task<Guid> Handle(RegisterUserCommand request, CancellationToken cancellationToken)
    {
        // Verify unique email (case-insensitive)
        var exists = await _context.Users
            .AnyAsync(u => u.Email.ToLower() == request.Email.ToLower(), cancellationToken);

        if (exists)
        {
            throw new InvalidOperationException("A user with this email address already exists.");
        }

        // Generate verification token (256-bit entropy)
        var token = Convert.ToHexString(RandomNumberGenerator.GetBytes(32));

        var user = new User
        {
            Email = request.Email,
            PasswordHash = PasswordHasher.HashPassword(request.Password),
            FullName = request.FullName,
            Role = "User",
            IsMfaEnabled = false,
            IsEmailVerified = false,
            EmailVerificationToken = token,
            EmailVerificationTokenExpires = DateTime.UtcNow.AddHours(24)
        };

        _context.Users.Add(user);
        await _context.SaveChangesAsync(cancellationToken);

        // Dispatch verification email
        var verificationUrl = $"http://localhost:4200/verify-email?token={token}";
        var emailBody = $@"
            <h2>Welcome to OpenMeet, {user.FullName}!</h2>
            <p>Please verify your email address to complete your registration by clicking the link below:</p>
            <p><a href=""{verificationUrl}"">{verificationUrl}</a></p>
            <p>This link is valid for 24 hours.</p>
            <p>Best regards,<br/>The OpenMeet Team</p>";

        await _emailService.SendEmailAsync(user.Email, "Verify your OpenMeet Account", emailBody);

        return user.Id;
    }
}
