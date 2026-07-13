using System;
using System.Collections.Generic;
using System.IdentityModel.Tokens.Jwt;
using System.Linq;
using System.Security.Claims;
using System.Text;
using System.Threading.Tasks;
using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.IdentityModel.Tokens;
using OpenMeet.Application.Common.Interfaces;
using OpenMeet.Application.Meetings.Commands;
using OpenMeet.Application.Meetings.Queries;

namespace OpenMeet.WebApi.Controllers;

public record CreateMeetingRequest(string Title, string? MeetingCode, DateTime? ScheduledStartTime, string? Passcode);

[ApiController]
[Authorize]
[Route("api/meetings")]
public class MeetingsController : ControllerBase
{
    private readonly IConfiguration _configuration;
    private readonly ISender _mediator;
    private readonly IApplicationDbContext _context;

    public MeetingsController(IConfiguration configuration, ISender mediator, IApplicationDbContext context)
    {
        _configuration = configuration;
        _mediator = mediator;
        _context = context;
    }

    private (Guid UserId, string FullName, string Email)? GetCurrentUser()
    {
        var idClaim = User.Claims.FirstOrDefault(c =>
            c.Type == ClaimTypes.NameIdentifier ||
            c.Type == "sub" ||
            c.Type == "nameid");
        var emailClaim = User.Claims.FirstOrDefault(c => c.Type == ClaimTypes.Email || c.Type == "email");
        var nameClaim = User.Claims.FirstOrDefault(c =>
            c.Type == ClaimTypes.Name ||
            c.Type == "unique_name" ||
            c.Type == "name");

        if (idClaim == null ||
            emailClaim == null ||
            nameClaim == null ||
            !Guid.TryParse(idClaim.Value, out var userId))
        {
            return null;
        }

        return (userId, nameClaim.Value, emailClaim.Value);
    }

    [HttpPost]
    public async Task<IActionResult> CreateMeeting([FromBody] CreateMeetingRequest request)
    {
        var user = GetCurrentUser();
        if (user == null)
        {
            return Unauthorized(new { error = "Authorization token is missing or invalid" });
        }

        var command = new CreateMeetingCommand(
            request.Title,
            request.MeetingCode,
            request.Passcode,
            request.ScheduledStartTime,
            user.Value.UserId
        );

        var result = await _mediator.Send(command);
        return Ok(result);
    }

    [HttpGet("scheduled")]
    public async Task<IActionResult> GetScheduledMeetings()
    {
        var user = GetCurrentUser();
        if (user == null)
        {
            return Unauthorized(new { error = "Authorization token is missing or invalid" });
        }

        var result = await _mediator.Send(new GetScheduledMeetingsQuery(user.Value.UserId));
        return Ok(result);
    }

    [HttpGet("past")]
    public async Task<IActionResult> GetPastMeetings()
    {
        var user = GetCurrentUser();
        if (user == null)
        {
            return Unauthorized(new { error = "Authorization token is missing or invalid" });
        }

        var result = await _mediator.Send(new GetPastMeetingsQuery(user.Value.UserId));
        return Ok(result);
    }

    [HttpPost("{meetingCode}/end")]
    public async Task<IActionResult> EndMeeting(string meetingCode)
    {
        var user = GetCurrentUser();
        if (user == null)
        {
            return Unauthorized(new { error = "Authorization token is missing or invalid" });
        }

        var meeting = await _context.Meetings
            .FirstOrDefaultAsync(m => m.MeetingCode.ToLower() == meetingCode.ToLower());

        if (meeting == null)
        {
            return NotFound(new { error = "Meeting not found" });
        }

        // Only host can end the meeting
        if (meeting.HostId != user.Value.UserId)
        {
            return Forbid();
        }

        meeting.ActualEndTime = DateTime.UtcNow;
        meeting.Status = "Ended";
        await _context.SaveChangesAsync(default);

        return Ok(new { success = true, message = "Meeting ended successfully" });
    }

    [HttpGet("{meetingCode}/chat")]
    public async Task<IActionResult> GetChatHistory(string meetingCode)
    {
        var user = GetCurrentUser();
        if (user == null)
        {
            return Unauthorized(new { error = "Authorization token is missing or invalid" });
        }

        var result = await _mediator.Send(new GetChatHistoryQuery(meetingCode));
        return Ok(result);
    }

    [HttpGet("token")]
    public async Task<IActionResult> GetToken([FromQuery] string roomName)
    {
        if (string.IsNullOrEmpty(roomName))
        {
            return BadRequest(new { error = "Room name is required" });
        }

        var user = GetCurrentUser();
        if (user == null)
        {
            return Unauthorized(new { error = "Authorization token is missing or invalid" });
        }

        var meeting = await _context.Meetings
            .FirstOrDefaultAsync(m => m.MeetingCode.ToLower() == roomName.ToLower());

        if (meeting == null)
        {
            return NotFound(new { error = "Meeting not found" });
        }

        if (meeting.Status == "Ended" || meeting.ActualEndTime != null)
        {
            return BadRequest(new { error = "Meeting has ended" });
        }

        var participantIdentity = user.Value.Email;
        var participantName = user.Value.FullName;

        try
        {
            // Retrieve LiveKit settings
            var liveKitSection = _configuration.GetSection("LiveKit");
            var apiKey = liveKitSection["ApiKey"];
            var apiSecret = liveKitSection["ApiSecret"];
            if (string.IsNullOrWhiteSpace(apiKey) || string.IsNullOrWhiteSpace(apiSecret))
            {
                return StatusCode(500, new { error = "LiveKit credentials are not configured" });
            }

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
            return Unauthorized(new { error = "Failed to generate LiveKit token: " + ex.Message });
        }
    }
}
