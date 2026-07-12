using System;
using System.Collections.Generic;
using OpenMeet.Domain.Common;

namespace OpenMeet.Domain.Entities;

public class Meeting : Entity
{
    public string Title { get; set; } = string.Empty;
    public string MeetingCode { get; set; } = string.Empty; // E.g., "abc-defg-hij"
    public string? Passcode { get; set; }
    public Guid HostId { get; set; }
    public User Host { get; set; } = null!;
    public DateTime ScheduledStartTime { get; set; }
    public DateTime? ActualStartTime { get; set; }
    public DateTime? ActualEndTime { get; set; }
    public string Status { get; set; } = "Scheduled"; // Scheduled, Active, Ended
    public bool IsWaitingRoomEnabled { get; set; }

    public ICollection<Participant> Participants { get; set; } = new List<Participant>();
    public ICollection<Message> Messages { get; set; } = new List<Message>();
}
