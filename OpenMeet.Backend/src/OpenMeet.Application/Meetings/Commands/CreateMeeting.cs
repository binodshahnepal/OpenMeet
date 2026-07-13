using System;
using System.Threading;
using System.Threading.Tasks;
using FluentValidation;
using MediatR;
using OpenMeet.Application.Common.Interfaces;
using OpenMeet.Domain.Entities;

namespace OpenMeet.Application.Meetings.Commands;

public record CreateMeetingResult(Guid Id, string MeetingCode, string Title, string Status);

public record CreateMeetingCommand(
    string Title,
    string? MeetingCode = null,
    string? Passcode = null,
    DateTime? ScheduledStartTime = null,
    Guid? HostId = null) : IRequest<CreateMeetingResult>;

public class CreateMeetingCommandValidator : AbstractValidator<CreateMeetingCommand>
{
    public CreateMeetingCommandValidator()
    {
        RuleFor(v => v.Title)
            .NotEmpty().WithMessage("Meeting title is required.")
            .MaximumLength(200).WithMessage("Meeting title must not exceed 200 characters.");
    }
}

public class CreateMeetingCommandHandler : IRequestHandler<CreateMeetingCommand, CreateMeetingResult>
{
    private readonly IApplicationDbContext _context;

    public CreateMeetingCommandHandler(IApplicationDbContext context)
    {
        _context = context;
    }

    public async Task<CreateMeetingResult> Handle(CreateMeetingCommand request, CancellationToken cancellationToken)
    {
        var meetingCode = request.MeetingCode;
        if (string.IsNullOrWhiteSpace(meetingCode))
        {
            var p1 = Guid.NewGuid().ToString().Substring(0, 3);
            var p2 = Guid.NewGuid().ToString().Substring(4, 4);
            var p3 = Guid.NewGuid().ToString().Substring(9, 3);
            meetingCode = $"{p1}-{p2}-{p3}".ToLower();
        }

        var meeting = new Meeting
        {
            Title = request.Title,
            MeetingCode = meetingCode,
            Passcode = request.Passcode,
            HostId = request.HostId ?? Guid.Empty,
            ScheduledStartTime = request.ScheduledStartTime ?? DateTime.UtcNow,
            ActualStartTime = request.ScheduledStartTime == null ? DateTime.UtcNow : null,
            Status = request.ScheduledStartTime == null ? "Active" : "Scheduled",
            IsWaitingRoomEnabled = false
        };

        _context.Meetings.Add(meeting);
        await _context.SaveChangesAsync(cancellationToken);

        return new CreateMeetingResult(meeting.Id, meeting.MeetingCode, meeting.Title, meeting.Status);
    }
}
