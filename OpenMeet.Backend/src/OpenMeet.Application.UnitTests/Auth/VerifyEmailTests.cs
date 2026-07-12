using System;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using OpenMeet.Application.Auth.Commands;
using OpenMeet.Domain.Entities;
using OpenMeet.Infrastructure.Persistence;
using Xunit;

namespace OpenMeet.Application.UnitTests.Auth;

public class VerifyEmailTests : IDisposable
{
    private readonly ApplicationDbContext _context;

    public VerifyEmailTests()
    {
        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase(databaseName: Guid.NewGuid().ToString())
            .Options;

        _context = new ApplicationDbContext(options);
    }

    public void Dispose()
    {
        _context.Database.EnsureDeleted();
        _context.Dispose();
    }

    [Fact]
    public async Task Handle_GivenValidToken_ShouldVerifyEmailSuccessfully()
    {
        // Arrange
        var user = new User
        {
            Email = "john@example.com",
            FullName = "John Doe",
            PasswordHash = "hashed_pw",
            IsEmailVerified = false,
            EmailVerificationToken = "VALID_TOKEN_123",
            EmailVerificationTokenExpires = DateTime.UtcNow.AddHours(2)
        };
        _context.Users.Add(user);
        await _context.SaveChangesAsync();

        var command = new VerifyEmailCommand("VALID_TOKEN_123");
        var handler = new VerifyEmailCommandHandler(_context);

        // Act
        var result = await handler.Handle(command, CancellationToken.None);

        // Assert
        Assert.True(result);

        var updatedUser = await _context.Users.FirstOrDefaultAsync(u => u.Id == user.Id);
        Assert.NotNull(updatedUser);
        Assert.True(updatedUser.IsEmailVerified);
        Assert.Null(updatedUser.EmailVerificationToken);
        Assert.Null(updatedUser.EmailVerificationTokenExpires);
    }

    [Fact]
    public async Task Handle_GivenInvalidToken_ShouldThrowInvalidOperationException()
    {
        // Arrange
        var user = new User
        {
            Email = "john@example.com",
            FullName = "John Doe",
            PasswordHash = "hashed_pw",
            IsEmailVerified = false,
            EmailVerificationToken = "REAL_TOKEN_999",
            EmailVerificationTokenExpires = DateTime.UtcNow.AddHours(2)
        };
        _context.Users.Add(user);
        await _context.SaveChangesAsync();

        var command = new VerifyEmailCommand("WRONG_TOKEN");
        var handler = new VerifyEmailCommandHandler(_context);

        // Act & Assert
        var exception = await Assert.ThrowsAsync<InvalidOperationException>(() =>
            handler.Handle(command, CancellationToken.None));

        Assert.Equal("Invalid or expired verification token.", exception.Message);
    }

    [Fact]
    public async Task Handle_GivenExpiredToken_ShouldThrowInvalidOperationException()
    {
        // Arrange
        var user = new User
        {
            Email = "john@example.com",
            FullName = "John Doe",
            PasswordHash = "hashed_pw",
            IsEmailVerified = false,
            EmailVerificationToken = "EXPIRED_TOKEN_777",
            EmailVerificationTokenExpires = DateTime.UtcNow.AddMinutes(-5) // Expired 5 minutes ago
        };
        _context.Users.Add(user);
        await _context.SaveChangesAsync();

        var command = new VerifyEmailCommand("EXPIRED_TOKEN_777");
        var handler = new VerifyEmailCommandHandler(_context);

        // Act & Assert
        var exception = await Assert.ThrowsAsync<InvalidOperationException>(() =>
            handler.Handle(command, CancellationToken.None));

        Assert.Equal("Verification token has expired.", exception.Message);
    }

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData(null)]
    public async Task Handle_GivenEmptyOrNullToken_ShouldThrowArgumentException(string? token)
    {
        // Arrange
        var command = new VerifyEmailCommand(token!);
        var handler = new VerifyEmailCommandHandler(_context);

        // Act & Assert
        var exception = await Assert.ThrowsAsync<ArgumentException>(() =>
            handler.Handle(command, CancellationToken.None));

        Assert.Equal("Verification token is required.", exception.Message);
    }
}
