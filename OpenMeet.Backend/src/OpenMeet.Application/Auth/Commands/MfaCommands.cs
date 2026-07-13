using System;
using System.Threading;
using System.Threading.Tasks;
using MediatR;
using Microsoft.EntityFrameworkCore;
using OpenMeet.Application.Common.Interfaces;

namespace OpenMeet.Application.Auth.Commands;

public record SetupMfaResult(string SecretKey, string QrCodeUrl);
public record SetupMfaCommand(Guid UserId) : IRequest<SetupMfaResult>;

public record EnableMfaCommand(Guid UserId, string Code) : IRequest<bool>;
public record DisableMfaCommand(Guid UserId) : IRequest<bool>;

public class MfaCommandsHandler : 
    IRequestHandler<SetupMfaCommand, SetupMfaResult>,
    IRequestHandler<EnableMfaCommand, bool>,
    IRequestHandler<DisableMfaCommand, bool>
{
    private readonly IApplicationDbContext _context;
    private readonly IOtpService _otpService;

    public MfaCommandsHandler(IApplicationDbContext context, IOtpService otpService)
    {
        _context = context;
        _otpService = otpService;
    }

    public async Task<SetupMfaResult> Handle(SetupMfaCommand request, CancellationToken cancellationToken)
    {
        var user = await _context.Users
            .FirstOrDefaultAsync(u => u.Id == request.UserId, cancellationToken);

        if (user == null)
        {
            throw new InvalidOperationException("User not found.");
        }

        var secretKey = user.MfaSecret;
        if (string.IsNullOrEmpty(secretKey))
        {
            secretKey = _otpService.GenerateSecretKey();
            user.MfaSecret = secretKey;
            await _context.SaveChangesAsync(cancellationToken);
        }

        var qrCodeUrl = _otpService.GetQrCodeUrl(user.Email, secretKey);

        return new SetupMfaResult(secretKey, qrCodeUrl);
    }

    public async Task<bool> Handle(EnableMfaCommand request, CancellationToken cancellationToken)
    {
        var user = await _context.Users
            .FirstOrDefaultAsync(u => u.Id == request.UserId, cancellationToken);

        if (user == null || string.IsNullOrEmpty(user.MfaSecret))
        {
            throw new InvalidOperationException("MFA setup has not been initiated for this user.");
        }

        var isValid = _otpService.VerifyCode(user.MfaSecret, request.Code);
        if (!isValid)
        {
            throw new InvalidOperationException("Invalid verification code.");
        }

        user.IsMfaEnabled = true;
        await _context.SaveChangesAsync(cancellationToken);

        return true;
    }

    public async Task<bool> Handle(DisableMfaCommand request, CancellationToken cancellationToken)
    {
        var user = await _context.Users
            .FirstOrDefaultAsync(u => u.Id == request.UserId, cancellationToken);

        if (user == null)
        {
            throw new InvalidOperationException("User not found.");
        }

        user.IsMfaEnabled = false;
        user.MfaSecret = null;
        await _context.SaveChangesAsync(cancellationToken);

        return true;
    }
}
