using System;
using System.Threading;
using System.Threading.Tasks;
using MediatR;
using Microsoft.EntityFrameworkCore;
using OpenMeet.Application.Common.Interfaces;

namespace OpenMeet.Application.Auth.Commands;

public record VerifyEmailCommand(string Token) : IRequest<bool>;

public class VerifyEmailCommandHandler : IRequestHandler<VerifyEmailCommand, bool>
{
    private readonly IApplicationDbContext _context;

    public VerifyEmailCommandHandler(IApplicationDbContext context)
    {
        _context = context;
    }

    public async Task<bool> Handle(VerifyEmailCommand request, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(request.Token))
        {
            throw new ArgumentException("Verification token is required.");
        }

        var user = await _context.Users
            .FirstOrDefaultAsync(u => u.EmailVerificationToken == request.Token, cancellationToken);

        if (user == null)
        {
            throw new InvalidOperationException("Invalid or expired verification token.");
        }

        if (user.EmailVerificationTokenExpires < DateTime.UtcNow)
        {
            throw new InvalidOperationException("Verification token has expired.");
        }

        user.IsEmailVerified = true;
        user.EmailVerificationToken = null;
        user.EmailVerificationTokenExpires = null;

        await _context.SaveChangesAsync(cancellationToken);

        return true;
    }
}
