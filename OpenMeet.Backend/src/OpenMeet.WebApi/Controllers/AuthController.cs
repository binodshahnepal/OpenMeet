using System;
using System.Linq;
using System.Security.Claims;
using System.Threading.Tasks;
using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using OpenMeet.Application.Auth.Commands;
using OpenMeet.Application.Common.Interfaces;

namespace OpenMeet.WebApi.Controllers;

public record VerifyMfaRequest(string Code);
public record VerifyMfaLoginRequest(Guid UserId, string Code);
public record UpdateProfileRequest(string FullName);

[ApiController]
[Route("api/auth")]
public class AuthController : ControllerBase
{
    private readonly ISender _mediator;
    private readonly IApplicationDbContext _context;
    private readonly IStorageService _storageService;
    private readonly IOtpService _otpService;
    private readonly IJwtTokenGenerator _jwtTokenGenerator;

    public AuthController(
        ISender mediator, 
        IApplicationDbContext context, 
        IStorageService storageService,
        IOtpService otpService,
        IJwtTokenGenerator jwtTokenGenerator)
    {
        _mediator = mediator;
        _context = context;
        _storageService = storageService;
        _otpService = otpService;
        _jwtTokenGenerator = jwtTokenGenerator;
    }

    private Guid? GetCurrentUserId()
    {
        var idClaim = User.Claims.FirstOrDefault(c =>
            c.Type == ClaimTypes.NameIdentifier ||
            c.Type == "sub" ||
            c.Type == "nameid");

        if (idClaim == null || !Guid.TryParse(idClaim.Value, out var userId))
        {
            return null;
        }

        return userId;
    }

    [HttpPost("register")]
    public async Task<IActionResult> Register([FromBody] RegisterUserCommand command)
    {
        try
        {
            var result = await _mediator.Send(command);
            return Ok(new { id = result.Id, verificationCode = result.VerificationCode, message = "Registration successful" });
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { error = ex.Message });
        }
    }

    [HttpPost("verify-email")]
    public async Task<IActionResult> VerifyEmail([FromBody] VerifyEmailCommand command)
    {
        try
        {
            var result = await _mediator.Send(command);
            return Ok(new { success = result, message = "Email verified successfully" });
        }
        catch (Exception ex) when (ex is InvalidOperationException || ex is ArgumentException)
        {
            return BadRequest(new { error = ex.Message });
        }
    }

    [HttpPost("login")]
    public async Task<IActionResult> Login([FromBody] LoginUserCommand command)
    {
        try
        {
            var result = await _mediator.Send(command);
            return Ok(result);
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { error = ex.Message });
        }
    }

    [HttpPost("mfa/setup")]
    [Authorize]
    public async Task<IActionResult> SetupMfa()
    {
        var userId = GetCurrentUserId();
        if (userId == null)
        {
            return Unauthorized(new { error = "Authorization token is missing or invalid" });
        }

        try
        {
            var result = await _mediator.Send(new SetupMfaCommand(userId.Value));
            return Ok(result);
        }
        catch (Exception ex)
        {
            return BadRequest(new { error = ex.Message });
        }
    }

    [HttpPost("mfa/enable")]
    [Authorize]
    public async Task<IActionResult> EnableMfa([FromBody] VerifyMfaRequest request)
    {
        var userId = GetCurrentUserId();
        if (userId == null)
        {
            return Unauthorized(new { error = "Authorization token is missing or invalid" });
        }

        try
        {
            await _mediator.Send(new EnableMfaCommand(userId.Value, request.Code));
            return Ok(new { success = true, message = "MFA enabled successfully" });
        }
        catch (Exception ex)
        {
            return BadRequest(new { error = ex.Message });
        }
    }

    [HttpPost("mfa/disable")]
    [Authorize]
    public async Task<IActionResult> DisableMfa()
    {
        var userId = GetCurrentUserId();
        if (userId == null)
        {
            return Unauthorized(new { error = "Authorization token is missing or invalid" });
        }

        try
        {
            await _mediator.Send(new DisableMfaCommand(userId.Value));
            return Ok(new { success = true, message = "MFA disabled successfully" });
        }
        catch (Exception ex)
        {
            return BadRequest(new { error = ex.Message });
        }
    }

    [HttpPost("mfa/verify-login")]
    public async Task<IActionResult> VerifyMfaLogin([FromBody] VerifyMfaLoginRequest request)
    {
        try
        {
            var user = await _context.Users.FirstOrDefaultAsync(u => u.Id == request.UserId);
            if (user == null || string.IsNullOrEmpty(user.MfaSecret))
            {
                return BadRequest(new { error = "MFA setup incomplete or user not found" });
            }

            if (!user.IsMfaEnabled)
            {
                return BadRequest(new { error = "MFA is not enabled for this account" });
            }

            var isValid = _otpService.VerifyCode(user.MfaSecret, request.Code);
            if (!isValid)
            {
                return BadRequest(new { error = "Invalid 2FA verification code" });
            }

            var token = _jwtTokenGenerator.GenerateToken(user);
            return Ok(new { token, id = user.Id, fullName = user.FullName, email = user.Email });
        }
        catch (Exception ex)
        {
            return BadRequest(new { error = ex.Message });
        }
    }

    [HttpPost("profile")]
    [Authorize]
    public async Task<IActionResult> UpdateProfile([FromBody] UpdateProfileRequest request)
    {
        var userId = GetCurrentUserId();
        if (userId == null)
        {
            return Unauthorized(new { error = "Authorization token is missing or invalid" });
        }

        var user = await _context.Users.FirstOrDefaultAsync(u => u.Id == userId.Value);
        if (user == null)
        {
            return NotFound(new { error = "User not found" });
        }

        user.FullName = request.FullName;
        await _context.SaveChangesAsync(default);

        return Ok(new { 
            success = true, 
            id = user.Id,
            fullName = user.FullName, 
            email = user.Email, 
            profilePictureUrl = user.ProfilePictureUrl,
            isMfaEnabled = user.IsMfaEnabled 
        });
    }

    [HttpPost("profile/avatar")]
    [Authorize]
    public async Task<IActionResult> UploadAvatar(IFormFile file)
    {
        var userId = GetCurrentUserId();
        if (userId == null)
        {
            return Unauthorized(new { error = "Authorization token is missing or invalid" });
        }

        if (file == null || file.Length == 0)
        {
            return BadRequest(new { error = "No file uploaded" });
        }

        var user = await _context.Users.FirstOrDefaultAsync(u => u.Id == userId.Value);
        if (user == null)
        {
            return NotFound(new { error = "User not found" });
        }

        using var stream = file.OpenReadStream();
        var avatarUrl = await _storageService.UploadFileAsync(stream, file.FileName, file.ContentType);

        user.ProfilePictureUrl = avatarUrl;
        await _context.SaveChangesAsync(default);

        return Ok(new { success = true, profilePictureUrl = avatarUrl });
    }

    [HttpGet("profile")]
    [Authorize]
    public async Task<IActionResult> GetProfile()
    {
        var userId = GetCurrentUserId();
        if (userId == null)
        {
            return Unauthorized(new { error = "Authorization token is missing or invalid" });
        }

        var user = await _context.Users.FirstOrDefaultAsync(u => u.Id == userId.Value);
        if (user == null)
        {
            return NotFound(new { error = "User not found" });
        }

        return Ok(new { 
            id = user.Id,
            fullName = user.FullName, 
            email = user.Email, 
            profilePictureUrl = user.ProfilePictureUrl,
            isMfaEnabled = user.IsMfaEnabled 
        });
    }
}
