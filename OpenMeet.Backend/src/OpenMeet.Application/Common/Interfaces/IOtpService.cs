namespace OpenMeet.Application.Common.Interfaces;

public interface IOtpService
{
    string GenerateSecretKey();
    string GetQrCodeUrl(string email, string secretKey);
    bool VerifyCode(string secretKey, string code);
}
