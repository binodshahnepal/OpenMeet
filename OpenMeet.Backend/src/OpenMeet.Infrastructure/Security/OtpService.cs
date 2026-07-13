using System;
using OtpNet;
using OpenMeet.Application.Common.Interfaces;

namespace OpenMeet.Infrastructure.Security;

public class OtpService : IOtpService
{
    private const string Issuer = "OpenMeet";

    public string GenerateSecretKey()
    {
        var key = KeyGeneration.GenerateRandomKey(20);
        return Base32Encoding.ToString(key);
    }

    public string GetQrCodeUrl(string email, string secretKey)
    {
        var formattedEmail = Uri.EscapeDataString(email);
        var formattedIssuer = Uri.EscapeDataString(Issuer);
        return $"otpauth://totp/{formattedIssuer}:{formattedEmail}?secret={secretKey}&issuer={formattedIssuer}&algorithm=SHA1&digits=6&period=30";
    }

    public bool VerifyCode(string secretKey, string code)
    {
        if (string.IsNullOrWhiteSpace(secretKey) || string.IsNullOrWhiteSpace(code))
        {
            return false;
        }

        try
        {
            var keyBytes = Base32Encoding.ToBytes(secretKey);
            var totp = new Totp(keyBytes);
            return totp.VerifyTotp(code, out _, new VerificationWindow(previous: 1, future: 1));
        }
        catch
        {
            return false;
        }
    }
}
