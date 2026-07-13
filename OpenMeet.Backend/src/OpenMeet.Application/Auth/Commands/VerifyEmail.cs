using System;
using System.Threading;
using System.Threading.Tasks;
using MediatR;
using Microsoft.EntityFrameworkCore;
using OpenMeet.Application.Common.Interfaces;

namespace OpenMeet.Application.Auth.Commands;

public record VerifyEmailCommand(string Email, string Code) : IRequest<bool>;

public class VerifyEmailCommandHandler : IRequestHandler<VerifyEmailCommand, bool>
{
    private readonly IApplicationDbContext _context;

    public VerifyEmailCommandHandler(IApplicationDbContext context)
    {
        _context = context;
    }

    public async Task<bool> Handle(VerifyEmailCommand request, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(request.Email))
        {
            throw new ArgumentException("Email is required.");
        }

        if (string.IsNullOrWhiteSpace(request.Code))
        {
            throw new ArgumentException("Verification code is required.");
        }

        var user = await _context.Users
            .FirstOrDefaultAsync(u => u.Email.ToLower() == request.Email.ToLower(), cancellationToken);

        if (user == null || user.EmailVerificationCode != request.Code)
        {
            throw new InvalidOperationException("Invalid email or verification code.");
        }

        if (user.EmailVerificationCodeExpires < DateTime.UtcNow)
        {
            throw new InvalidOperationException("Verification code has expired.");
        }

        user.IsEmailVerified = true;
        user.EmailVerificationCode = null;
        user.EmailVerificationCodeExpires = null;

        await _context.SaveChangesAsync(cancellationToken);

        return true;
    }
}
