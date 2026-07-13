using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using MediatR;
using Microsoft.EntityFrameworkCore;
using OpenMeet.Application.Common.Interfaces;

namespace OpenMeet.Application.Meetings.Queries;

public record MeetingDto(
    Guid Id,
    string Title,
    string MeetingCode,
    string? Passcode,
    DateTime ScheduledStartTime,
    DateTime? ActualStartTime,
    DateTime? ActualEndTime,
    string Status,
    int ParticipantCount);

public record GetScheduledMeetingsQuery(Guid UserId) : IRequest<List<MeetingDto>>;
public record GetPastMeetingsQuery(Guid UserId) : IRequest<List<MeetingDto>>;

public class GetScheduledMeetingsQueryHandler : IRequestHandler<GetScheduledMeetingsQuery, List<MeetingDto>>
{
    private readonly IApplicationDbContext _context;

    public GetScheduledMeetingsQueryHandler(IApplicationDbContext context)
    {
        _context = context;
    }

    public async Task<List<MeetingDto>> Handle(GetScheduledMeetingsQuery request, CancellationToken cancellationToken)
    {
        var meetings = await _context.Meetings
            .Where(m => (m.HostId == request.UserId || m.Participants.Any(p => p.UserId == request.UserId)) 
                        && m.Status != "Ended")
            .OrderBy(m => m.ScheduledStartTime)
            .Select(m => new MeetingDto(
                m.Id,
                m.Title,
                m.MeetingCode,
                m.Passcode,
                m.ScheduledStartTime,
                m.ActualStartTime,
                m.ActualEndTime,
                m.Status,
                m.Participants.Count))
            .ToListAsync(cancellationToken);

        return meetings;
    }
}

public class GetPastMeetingsQueryHandler : IRequestHandler<GetPastMeetingsQuery, List<MeetingDto>>
{
    private readonly IApplicationDbContext _context;

    public GetPastMeetingsQueryHandler(IApplicationDbContext context)
    {
        _context = context;
    }

    public async Task<List<MeetingDto>> Handle(GetPastMeetingsQuery request, CancellationToken cancellationToken)
    {
        var meetings = await _context.Meetings
            .Where(m => (m.HostId == request.UserId || m.Participants.Any(p => p.UserId == request.UserId)) 
                        && (m.Status == "Ended" || m.ActualEndTime != null))
            .OrderByDescending(m => m.ActualEndTime ?? m.ScheduledStartTime)
            .Select(m => new MeetingDto(
                m.Id,
                m.Title,
                m.MeetingCode,
                m.Passcode,
                m.ScheduledStartTime,
                m.ActualStartTime,
                m.ActualEndTime,
                m.Status,
                m.Participants.Count))
            .ToListAsync(cancellationToken);

        return meetings;
    }
}
