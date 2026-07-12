using System;
using OpenMeet.Domain.Common;

namespace OpenMeet.Domain.Entities;

public class Message : Entity
{
    public Guid MeetingId { get; set; }
    public Meeting Meeting { get; set; } = null!;
    public Guid? SenderId { get; set; }
    public User? Sender { get; set; }
    public string Content { get; set; } = string.Empty;
    public bool IsPrivate { get; set; }
    public Guid? RecipientId { get; set; } // Nullable if group chat
}
