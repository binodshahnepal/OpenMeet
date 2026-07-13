using System;
using System.Collections.Generic;
using System.IdentityModel.Tokens.Jwt;
using System.Linq;
using System.Security.Claims;
using System.Text;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Configuration;
using Microsoft.IdentityModel.Tokens;

namespace OpenMeet.WebApi.Controllers;

[ApiController]
[Route("api/meetings")]
public class MeetingsController : ControllerBase
{
    private readonly IConfiguration _configuration;

    public MeetingsController(IConfiguration configuration)
    {
        _configuration = configuration;
    }

    [HttpGet("token")]
    public IActionResult GetToken([FromQuery] string roomName)
    {
        if (string.IsNullOrEmpty(roomName))
        {
            return BadRequest(new { error = "Room name is required" });
        }

        // Extract and manually validate Authorization JWT header
        var authHeader = Request.Headers["Authorization"].ToString();
        if (string.IsNullOrEmpty(authHeader) || !authHeader.StartsWith("Bearer "))
        {
            return Unauthorized(new { error = "Authorization token is missing or invalid" });
        }

        var token = authHeader.Substring("Bearer ".Length).Trim();
        try
        {
            var handler = new JwtSecurityTokenHandler();
            var jwtToken = handler.ReadJwtToken(token);

            // Verify expiry (relaxed skew tolerance checking)
            if (jwtToken.ValidTo < DateTime.UtcNow)
            {
                return Unauthorized(new { error = "Authorization token has expired" });
            }

            var emailClaim = jwtToken.Claims.FirstOrDefault(c => c.Type == ClaimTypes.Email || c.Type == "email");
            var nameClaim = jwtToken.Claims.FirstOrDefault(c => c.Type == ClaimTypes.Name || c.Type == "unique_name" || c.Type == "name");

            if (emailClaim == null || nameClaim == null)
            {
                return Unauthorized(new { error = "Invalid token claims" });
            }

            var participantIdentity = emailClaim.Value;
            var participantName = nameClaim.Value;

            // Retrieve LiveKit settings
            var liveKitSection = _configuration.GetSection("LiveKit");
            var apiKey = liveKitSection["ApiKey"] ?? "devkey";
            var apiSecret = liveKitSection["ApiSecret"] ?? "devsecretkey_openmeet_development_only_12345";

            var key = Encoding.UTF8.GetBytes(apiSecret);
            var tokenHandler = new JwtSecurityTokenHandler();

            var header = new JwtHeader(new SigningCredentials(
                new SymmetricSecurityKey(key),
                SecurityAlgorithms.HmacSha256));

            var payload = new JwtPayload(
                issuer: apiKey,
                audience: null,
                claims: null,
                notBefore: null,
                expires: DateTime.UtcNow.AddHours(2)
            )
            {
                { "sub", participantIdentity },
                { "name", participantName },
                { "video", new Dictionary<string, object>
                    {
                        { "roomJoin", true },
                        { "room", roomName },
                        { "canPublish", true },
                        { "canSubscribe", true },
                        { "canPublishData", true }
                    }
                }
            };

            var secToken = new JwtSecurityToken(header, payload);
            var liveKitToken = tokenHandler.WriteToken(secToken);

            return Ok(new { token = liveKitToken });
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[MeetingsController ERROR]: {ex}");
            return Unauthorized(new { error = "Failed to parse authentication token: " + ex.Message });
        }
    }
}
