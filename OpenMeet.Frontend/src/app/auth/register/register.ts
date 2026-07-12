import { Component, signal, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './register.html',
  styleUrl: './register.css'
})
export class RegisterComponent {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  // Form fields using signals
  protected readonly fullName = signal('');
  protected readonly email = signal('');
  protected readonly password = signal('');
  protected readonly confirmPassword = signal('');

  // Status states
  protected readonly isLoading = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly successMessage = signal<string | null>(null);
  protected readonly verificationLink = signal<string | null>(null);

  protected async onSubmit(): Promise<void> {
    this.errorMessage.set(null);
    this.successMessage.set(null);
    this.verificationLink.set(null);

    // Client-side validation
    if (!this.fullName() || !this.email() || !this.password() || !this.confirmPassword()) {
      this.errorMessage.set('All fields are required.');
      return;
    }

    if (this.password() !== this.confirmPassword()) {
      this.errorMessage.set('Passwords do not match.');
      return;
    }

    if (this.password().length < 6) {
      this.errorMessage.set('Password must be at least 6 characters long.');
      return;
    }

    this.isLoading.set(true);

    this.authService.register({
      email: this.email(),
      passwordHash: this.password(),
      fullName: this.fullName()
    }).subscribe({
      next: (response) => {
        this.isLoading.set(false);
        this.verificationLink.set(`http://localhost:4200/verify-email?token=${response.verificationToken}`);
      },
      error: (err) => {
        this.isLoading.set(false);
        const serverError = err.error?.error || 'An error occurred during registration. Please try again.';
        this.errorMessage.set(serverError);
      }
    });
  }
}
