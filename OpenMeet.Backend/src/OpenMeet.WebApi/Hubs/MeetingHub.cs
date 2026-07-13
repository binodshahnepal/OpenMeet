using System;
using System.Threading.Tasks;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using OpenMeet.Application.Common.Interfaces;
using OpenMeet.Domain.Entities;

namespace OpenMeet.WebApi.Hubs;

public class MeetingHub : Hub
{
    private readonly IApplicationDbContext _context;

    public MeetingHub(IApplicationDbContext context)
    {
        _context = context;
    }

    public async Task JoinMeeting(string meetingCode, string displayName)
    {
        await Groups.AddToGroupAsync(Context.ConnectionId, meetingCode);
        await Clients.Group(meetingCode).SendAsync("UserJoined", Context.ConnectionId, displayName);

        // Also track participant in database if we want to log they joined
        var meeting = await _context.Meetings
            .FirstOrDefaultAsync(m => m.MeetingCode.ToLower() == meetingCode.ToLower());

        if (meeting != null)
        {
            // Set status to active if it's not already
            if (meeting.Status == "Scheduled")
            {
                meeting.Status = "Active";
                meeting.ActualStartTime = DateTime.UtcNow;
                await _context.SaveChangesAsync(default);
            }

            // Create participant log if it doesn't already exist for this connection/name
            var participant = new Participant
            {
                MeetingId = meeting.Id,
                DisplayName = displayName,
                Role = meeting.HostId == Guid.Empty ? "Host" : "Participant", // Simple role resolution
                Status = "InMeeting",
                JoinedAt = DateTime.UtcNow,
                IsMuted = true,
                IsCameraOn = false
            };

            _context.Participants.Add(participant);
            await _context.SaveChangesAsync(default);
        }
    }

    public async Task SendMessage(string meetingCode, string senderEmail, string senderName, string messageContent)
    {
        var meeting = await _context.Meetings
            .FirstOrDefaultAsync(m => m.MeetingCode.ToLower() == meetingCode.ToLower());
        var user = await _context.Users
            .FirstOrDefaultAsync(u => u.Email.ToLower() == senderEmail.ToLower());

        if (meeting != null)
        {
            var msg = new Message
            {
                MeetingId = meeting.Id,
                SenderId = user?.Id,
                Content = messageContent,
                IsPrivate = false
            };
            _context.Messages.Add(msg);
            await _context.SaveChangesAsync(default);
        }

        await Clients.Group(meetingCode).SendAsync("ReceiveMessage", senderName, messageContent);
    }

    public async Task SendDraw(string meetingCode, string drawData)
    {
        await Clients.OthersInGroup(meetingCode).SendAsync("ReceiveDraw", drawData);
    }

    public async Task SendReaction(string meetingCode, string senderName, string reactionType)
    {
        await Clients.Group(meetingCode).SendAsync("ReceiveReaction", senderName, reactionType);
    }

    public async Task SendSubtitle(string meetingCode, string senderName, string text)
    {
        await Clients.Group(meetingCode).SendAsync("ReceiveSubtitle", senderName, text);
    }

    public async Task CreatePoll(string meetingCode, string question, string optionsJson)
    {
        await Clients.Group(meetingCode).SendAsync("ReceivePollCreated", question, optionsJson);
    }

    public async Task CastVote(string meetingCode, int optionIndex)
    {
        await Clients.Group(meetingCode).SendAsync("ReceiveVoteCast", optionIndex);
    }

    public async Task SubmitQuestion(string meetingCode, string senderName, string text)
    {
        await Clients.Group(meetingCode).SendAsync("ReceiveQuestionSubmitted", Guid.NewGuid().ToString(), senderName, text);
    }

    public async Task UpvoteQuestion(string meetingCode, string questionId)
    {
        await Clients.Group(meetingCode).SendAsync("ReceiveQuestionUpvoted", questionId);
    }

    public async Task RequestMediaMute(string meetingCode, string targetIdentity, string mediaType)
    {
        await Clients.Group(meetingCode).SendAsync("ReceiveMediaMuteRequest", targetIdentity, mediaType);
    }

    public async Task RequestKick(string meetingCode, string targetIdentity)
    {
        await Clients.Group(meetingCode).SendAsync("ReceiveKickRequest", targetIdentity);
    }

    public async Task TriggerBreakout(string meetingCode, string assignmentsJson)
    {
        await Clients.Group(meetingCode).SendAsync("ReceiveBreakoutTrigger", assignmentsJson);
    }

    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        await base.OnDisconnectedAsync(exception);
    }
}
