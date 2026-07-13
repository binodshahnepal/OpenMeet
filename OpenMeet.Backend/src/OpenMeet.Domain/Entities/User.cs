using System;
using OpenMeet.Domain.Common;

namespace OpenMeet.Domain.Entities;

public class User : Entity
{
    public string Email { get; set; } = string.Empty;
    public string PasswordHash { get; set; } = string.Empty;
    public string FullName { get; set; } = string.Empty;
    public string Role { get; set; } = "User"; // E.g., User, Admin
    public bool IsMfaEnabled { get; set; }
    public string? MfaSecret { get; set; }
    public bool IsEmailVerified { get; set; }
    public string? EmailVerificationCode { get; set; }
    public DateTime? EmailVerificationCodeExpires { get; set; }
}
