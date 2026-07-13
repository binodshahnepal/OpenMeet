using System;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using NSubstitute;
using OpenMeet.Application.Auth.Commands;
using OpenMeet.Application.Common.Interfaces;
using OpenMeet.Application.Common.Security;
using OpenMeet.Domain.Entities;
using OpenMeet.Infrastructure.Persistence;
using Xunit;

namespace OpenMeet.Application.UnitTests.Auth;

public class LoginUserTests : IDisposable
{
    private readonly ApplicationDbContext _context;
    private readonly IJwtTokenGenerator _jwtTokenGenerator;

    public LoginUserTests()
    {
        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase(databaseName: Guid.NewGuid().ToString())
            .Options;

        _context = new ApplicationDbContext(options);
        _jwtTokenGenerator = Substitute.For<IJwtTokenGenerator>();
    }

    public void Dispose()
    {
        _context.Database.EnsureDeleted();
        _context.Dispose();
    }

    [Fact]
    public async Task Handle_GivenValidCredentialsAndVerifiedEmail_ShouldReturnLoginResultWithToken()
    {
        // Arrange
        var password = "SecretPassword123";
        var user = new User
        {
            Email = "jane@example.com",
            FullName = "Jane Doe",
            PasswordHash = PasswordHasher.HashPassword(password),
            IsEmailVerified = true,
            Role = "User"
        };
        _context.Users.Add(user);
        await _context.SaveChangesAsync();

        _jwtTokenGenerator.GenerateToken(Arg.Is<User>(u => u.Id == user.Id)).Returns("MOCKED_JWT_TOKEN");

        var command = new LoginUserCommand("jane@example.com", password);
        var handler = new LoginUserCommandHandler(_context, _jwtTokenGenerator);

        // Act
        var result = await handler.Handle(command, CancellationToken.None);

        // Assert
        Assert.NotNull(result);
        Assert.Equal(user.Id, result.Id);
        Assert.Equal(user.FullName, result.FullName);
        Assert.Equal(user.Email, result.Email);
        Assert.Equal("MOCKED_JWT_TOKEN", result.Token);
    }

    [Fact]
    public async Task Handle_GivenIncorrectPassword_ShouldThrowInvalidOperationException()
    {
        // Arrange
        var user = new User
        {
            Email = "jane@example.com",
            FullName = "Jane Doe",
            PasswordHash = PasswordHasher.HashPassword("CorrectPassword"),
            IsEmailVerified = true
        };
        _context.Users.Add(user);
        await _context.SaveChangesAsync();

        var command = new LoginUserCommand("jane@example.com", "WrongPassword");
        var handler = new LoginUserCommandHandler(_context, _jwtTokenGenerator);

        // Act & Assert
        var exception = await Assert.ThrowsAsync<InvalidOperationException>(() =>
            handler.Handle(command, CancellationToken.None));

        Assert.Equal("Invalid email or password.", exception.Message);
    }

    [Fact]
    public async Task Handle_GivenUnverifiedEmail_ShouldThrowInvalidOperationException()
    {
        // Arrange
        var password = "SecretPassword123";
        var user = new User
        {
            Email = "jane@example.com",
            FullName = "Jane Doe",
            PasswordHash = PasswordHasher.HashPassword(password),
            IsEmailVerified = false
        };
        _context.Users.Add(user);
        await _context.SaveChangesAsync();

        var command = new LoginUserCommand("jane@example.com", password);
        var handler = new LoginUserCommandHandler(_context, _jwtTokenGenerator);

        // Act & Assert
        var exception = await Assert.ThrowsAsync<InvalidOperationException>(() =>
            handler.Handle(command, CancellationToken.None));

        Assert.Equal("Please verify your email address before logging in.", exception.Message);
    }
}
