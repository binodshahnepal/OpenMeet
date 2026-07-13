import { Component, signal, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './login.html',
  styleUrl: './login.css'
})
export class LoginComponent {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  // Form signals
  protected readonly email = signal('');
  protected readonly password = signal('');

  // MFA Challenge signals
  protected readonly showMfaChallenge = signal(false);
  protected readonly mfaUserId = signal<string | null>(null);
  protected readonly mfaCode = signal('');

  // Status signals
  protected readonly isLoading = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly successMessage = signal<string | null>(null);

  protected onSubmit(): void {
    this.errorMessage.set(null);
    this.successMessage.set(null);

    if (!this.email() || !this.password()) {
      this.errorMessage.set('All fields are required.');
      return;
    }

    this.isLoading.set(true);

    this.authService.login({
      email: this.email(),
      passwordHash: this.password()
    }).subscribe({
      next: (response) => {
        this.isLoading.set(false);
        
        if (response.requiresMfa) {
          this.mfaUserId.set(response.id);
          this.showMfaChallenge.set(true);
          return;
        }

        // Store JWT token and user info securely in LocalStorage
        localStorage.setItem('token', response.token);
        localStorage.setItem('user', JSON.stringify({
          id: response.id,
          fullName: response.fullName,
          email: response.email
        }));

        this.successMessage.set(`Welcome back, ${response.fullName}! Login successful.`);
        setTimeout(() => {
          this.router.navigate(['/lobby']);
        }, 600);
      },
      error: (err) => {
        this.isLoading.set(false);
        const serverError = err.error?.error || 'Authentication failed. Please check your credentials.';
        this.errorMessage.set(serverError);
      }
    });
  }

  protected verifyMfaLogin(): void {
    this.errorMessage.set(null);
    this.successMessage.set(null);

    const code = this.mfaCode().trim();
    const userId = this.mfaUserId();

    if (!code || !userId) {
      this.errorMessage.set('Verification code is required.');
      return;
    }

    this.isLoading.set(true);

    this.authService.verifyMfaLogin(userId, code).subscribe({
      next: (response) => {
        this.isLoading.set(false);
        
        localStorage.setItem('token', response.token);
        localStorage.setItem('user', JSON.stringify({
          id: response.id,
          fullName: response.fullName,
          email: response.email
        }));

        this.successMessage.set(`Welcome back, ${response.fullName}! Login successful.`);
        setTimeout(() => {
          this.router.navigate(['/lobby']);
        }, 600);
      },
      error: (err) => {
        this.isLoading.set(false);
        this.errorMessage.set(err.error?.error || 'Invalid 2FA verification code. Please try again.');
      }
    });
  }
}
