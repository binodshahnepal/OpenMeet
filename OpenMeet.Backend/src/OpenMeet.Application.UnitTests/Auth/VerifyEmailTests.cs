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
    public async Task Handle_GivenValidCode_ShouldVerifyEmailSuccessfully()
    {
        // Arrange
        var user = new User
        {
            Email = "john@example.com",
            FullName = "John Doe",
            PasswordHash = "hashed_pw",
            IsEmailVerified = false,
            EmailVerificationCode = "123456",
            EmailVerificationCodeExpires = DateTime.UtcNow.AddMinutes(15)
        };
        _context.Users.Add(user);
        await _context.SaveChangesAsync();

        var command = new VerifyEmailCommand("john@example.com", "123456");
        var handler = new VerifyEmailCommandHandler(_context);

        // Act
        var result = await handler.Handle(command, CancellationToken.None);

        // Assert
        Assert.True(result);

        var updatedUser = await _context.Users.FirstOrDefaultAsync(u => u.Id == user.Id);
        Assert.NotNull(updatedUser);
        Assert.True(updatedUser.IsEmailVerified);
        Assert.Null(updatedUser.EmailVerificationCode);
        Assert.Null(updatedUser.EmailVerificationCodeExpires);
    }

    [Fact]
    public async Task Handle_GivenInvalidCode_ShouldThrowInvalidOperationException()
    {
        // Arrange
        var user = new User
        {
            Email = "john@example.com",
            FullName = "John Doe",
            PasswordHash = "hashed_pw",
            IsEmailVerified = false,
            EmailVerificationCode = "123456",
            EmailVerificationCodeExpires = DateTime.UtcNow.AddMinutes(15)
        };
        _context.Users.Add(user);
        await _context.SaveChangesAsync();

        var command = new VerifyEmailCommand("john@example.com", "999999");
        var handler = new VerifyEmailCommandHandler(_context);

        // Act & Assert
        var exception = await Assert.ThrowsAsync<InvalidOperationException>(() =>
            handler.Handle(command, CancellationToken.None));

        Assert.Equal("Invalid email or verification code.", exception.Message);
    }

    [Fact]
    public async Task Handle_GivenExpiredCode_ShouldThrowInvalidOperationException()
    {
        // Arrange
        var user = new User
        {
            Email = "john@example.com",
            FullName = "John Doe",
            PasswordHash = "hashed_pw",
            IsEmailVerified = false,
            EmailVerificationCode = "123456",
            EmailVerificationCodeExpires = DateTime.UtcNow.AddMinutes(-5) // Expired 5 minutes ago
        };
        _context.Users.Add(user);
        await _context.SaveChangesAsync();

        var command = new VerifyEmailCommand("john@example.com", "123456");
        var handler = new VerifyEmailCommandHandler(_context);

        // Act & Assert
        var exception = await Assert.ThrowsAsync<InvalidOperationException>(() =>
            handler.Handle(command, CancellationToken.None));

        Assert.Equal("Verification code has expired.", exception.Message);
    }

    [Theory]
    [InlineData("", "123456", "Email is required.")]
    [InlineData("   ", "123456", "Email is required.")]
    [InlineData(null, "123456", "Email is required.")]
    [InlineData("john@example.com", "", "Verification code is required.")]
    [InlineData("john@example.com", "   ", "Verification code is required.")]
    [InlineData("john@example.com", null, "Verification code is required.")]
    public async Task Handle_GivenEmptyOrNullParameters_ShouldThrowArgumentException(string? email, string? code, string expectedMessage)
    {
        // Arrange
        var command = new VerifyEmailCommand(email!, code!);
        var handler = new VerifyEmailCommandHandler(_context);

        // Act & Assert
        var exception = await Assert.ThrowsAsync<ArgumentException>(() =>
            handler.Handle(command, CancellationToken.None));

        Assert.Equal(expectedMessage, exception.Message);
    }
}
