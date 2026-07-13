using OpenMeet.Domain.Entities;

namespace OpenMeet.Application.Common.Interfaces;

public interface IJwtTokenGenerator
{
    string GenerateToken(User user);
}
