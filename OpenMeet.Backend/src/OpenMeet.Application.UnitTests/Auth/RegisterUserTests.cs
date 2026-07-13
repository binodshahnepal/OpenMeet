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

public class RegisterUserTests : IDisposable
{
    private readonly ApplicationDbContext _context;
    private readonly IEmailService _emailService = Substitute.For<IEmailService>();

    public RegisterUserTests()
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
    public async Task Handle_GivenValidRequest_ShouldRegisterUserSuccessfully()
    {
        // Arrange
        var command = new RegisterUserCommand("john@example.com", "Password123", "John Doe");
        var handler = new RegisterUserCommandHandler(_context, _emailService);

        // Act
        var result = await handler.Handle(command, CancellationToken.None);

        // Assert
        Assert.NotEqual(Guid.Empty, result.Id);
        Assert.NotNull(result.VerificationCode);
        
        var user = await _context.Users.FirstOrDefaultAsync(u => u.Id == result.Id);
        Assert.NotNull(user);
        Assert.Equal("john@example.com", user.Email);
        Assert.Equal("John Doe", user.FullName);
        Assert.Equal("User", user.Role);
        Assert.False(user.IsEmailVerified);
        Assert.NotNull(user.EmailVerificationCode);
        Assert.True(PasswordHasher.VerifyPassword("Password123", user.PasswordHash));

        // Verify email service was called once
        await _emailService.Received(1).SendEmailAsync(
            user.Email,
            Arg.Any<string>(),
            Arg.Any<string>());
    }

    [Fact]
    public async Task Handle_GivenExistingEmail_ShouldThrowInvalidOperationException()
    {
        // Arrange
        var existingUser = new User
        {
            Email = "john@example.com",
            FullName = "John Existing",
            PasswordHash = PasswordHasher.HashPassword("OldPassword")
        };
        _context.Users.Add(existingUser);
        await _context.SaveChangesAsync();

        var command = new RegisterUserCommand("JOHN@example.com", "Password123", "John New");
        var handler = new RegisterUserCommandHandler(_context, _emailService);

        // Act & Assert
        var exception = await Assert.ThrowsAsync<InvalidOperationException>(() =>
            handler.Handle(command, CancellationToken.None));

        Assert.Equal("A user with this email address already exists.", exception.Message);
    }

    [Theory]
    [InlineData("", "Password123", "John Doe", "Email is required.")]
    [InlineData("invalid-email", "Password123", "John Doe", "A valid email address is required.")]
    [InlineData("john@example.com", "", "John Doe", "Password is required.")]
    [InlineData("john@example.com", "12345", "John Doe", "Password must be at least 6 characters long.")]
    [InlineData("john@example.com", "Password123", "", "Full name is required.")]
    public void Validator_GivenInvalidData_ShouldHaveValidationErrors(
        string email, string password, string fullName, string expectedErrorMessage)
    {
        // Arrange
        var command = new RegisterUserCommand(email, password, fullName);
        var validator = new RegisterUserCommandValidator();

        // Act
        var result = validator.Validate(command);

        // Assert
        Assert.False(result.IsValid);
        Assert.Contains(result.Errors, e => e.ErrorMessage == expectedErrorMessage);
    }
}
