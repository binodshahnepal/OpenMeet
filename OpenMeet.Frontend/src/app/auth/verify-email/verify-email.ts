import { Component, OnInit, signal, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-verify-email',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './verify-email.html',
  styleUrl: './verify-email.css'
})
export class VerifyEmailComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly authService = inject(AuthService);

  // States using signals
  protected readonly email = signal('');
  protected readonly code = signal('');
  protected readonly isLoading = signal(false);
  protected readonly isVerified = signal(false);
  protected readonly errorMessage = signal<string | null>(null);

  ngOnInit(): void {
    const emailParam = this.route.snapshot.queryParamMap.get('email');
    const codeParam = this.route.snapshot.queryParamMap.get('code');

    if (emailParam) {
      this.email.set(emailParam);
    }
    if (codeParam) {
      this.code.set(codeParam);
    }

    // Auto-verify if both are present in the URL query params
    if (emailParam && codeParam) {
      this.verify();
    }
  }

  protected verify(): void {
    if (!this.email() || !this.code()) {
      this.errorMessage.set('Email and verification code are required.');
      return;
    }

    this.isLoading.set(true);
    this.errorMessage.set(null);

    this.authService.verifyEmail(this.email(), this.code()).subscribe({
      next: () => {
        this.isLoading.set(false);
        this.isVerified.set(true);
      },
      error: (err) => {
        this.isLoading.set(false);
        const serverError = err.error?.error || 'Verification failed. The code may have expired or is invalid.';
        this.errorMessage.set(serverError);
      }
    });
  }
}
