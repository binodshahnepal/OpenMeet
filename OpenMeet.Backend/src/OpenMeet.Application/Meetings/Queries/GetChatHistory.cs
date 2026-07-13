using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using MediatR;
using Microsoft.EntityFrameworkCore;
using OpenMeet.Application.Common.Interfaces;

namespace OpenMeet.Application.Meetings.Queries;

public record ChatMessageDto(
    string SenderName,
    string SenderEmail,
    string Content,
    DateTime Timestamp);

public record GetChatHistoryQuery(string MeetingCode) : IRequest<List<ChatMessageDto>>;

public class GetChatHistoryQueryHandler : IRequestHandler<GetChatHistoryQuery, List<ChatMessageDto>>
{
    private readonly IApplicationDbContext _context;

    public GetChatHistoryQueryHandler(IApplicationDbContext context)
    {
        _context = context;
    }

    public async Task<List<ChatMessageDto>> Handle(GetChatHistoryQuery request, CancellationToken cancellationToken)
    {
        var meeting = await _context.Meetings
            .FirstOrDefaultAsync(m => m.MeetingCode.ToLower() == request.MeetingCode.ToLower(), cancellationToken);

        if (meeting == null)
        {
            return new List<ChatMessageDto>();
        }

        var messages = await _context.Messages
            .Where(m => m.MeetingId == meeting.Id)
            .OrderBy(m => m.CreatedAt)
            .Select(m => new ChatMessageDto(
                m.Sender != null ? m.Sender.FullName : "Guest",
                m.Sender != null ? m.Sender.Email : "",
                m.Content,
                m.CreatedAt))
            .ToListAsync(cancellationToken);

        return messages;
    }
}
