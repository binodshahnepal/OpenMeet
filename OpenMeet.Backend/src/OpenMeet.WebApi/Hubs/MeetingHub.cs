using System;
using System.Threading.Tasks;
using Microsoft.AspNetCore.SignalR;

namespace OpenMeet.WebApi.Hubs;

public class MeetingHub : Hub
{
    public async Task JoinMeeting(string meetingCode, string displayName)
    {
        await Groups.AddToGroupAsync(Context.ConnectionId, meetingCode);
        await Clients.Group(meetingCode).SendAsync("UserJoined", Context.ConnectionId, displayName);
    }

    public async Task SendMessage(string meetingCode, string senderName, string messageContent)
    {
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

    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        await base.OnDisconnectedAsync(exception);
    }
}
