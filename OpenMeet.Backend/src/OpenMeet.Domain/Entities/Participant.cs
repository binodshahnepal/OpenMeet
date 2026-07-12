using System;
using OpenMeet.Domain.Common;

namespace OpenMeet.Domain.Entities;

public class Participant : Entity
{
    public Guid MeetingId { get; set; }
    public Meeting Meeting { get; set; } = null!;
    public Guid? UserId { get; set; } // Nullable for guest users
    public User? User { get; set; }
    public string DisplayName { get; set; } = string.Empty;
    public string Role { get; set; } = "Participant"; // Host, CoHost, Participant
    public string Status { get; set; } = "WaitingRoom"; // WaitingRoom, InMeeting, Disconnected, Left
    public DateTime JoinedAt { get; set; } = DateTime.UtcNow;
    public DateTime? LeftAt { get; set; }
    public bool IsMuted { get; set; }
    public bool IsCameraOn { get; set; }
}
