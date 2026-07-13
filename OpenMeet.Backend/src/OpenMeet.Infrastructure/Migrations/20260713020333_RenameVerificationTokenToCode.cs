using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace OpenMeet.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class RenameVerificationTokenToCode : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.RenameColumn(
                name: "EmailVerificationTokenExpires",
                table: "Users",
                newName: "EmailVerificationCodeExpires");

            migrationBuilder.RenameColumn(
                name: "EmailVerificationToken",
                table: "Users",
                newName: "EmailVerificationCode");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.RenameColumn(
                name: "EmailVerificationCodeExpires",
                table: "Users",
                newName: "EmailVerificationTokenExpires");

            migrationBuilder.RenameColumn(
                name: "EmailVerificationCode",
                table: "Users",
                newName: "EmailVerificationToken");
        }
    }
}
