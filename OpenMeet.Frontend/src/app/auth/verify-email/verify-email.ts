import { Component, OnInit, signal, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-verify-email',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './verify-email.html',
  styleUrl: './verify-email.css'
})
export class VerifyEmailComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly authService = inject(AuthService);

  // States using signals
  protected readonly isLoading = signal(true);
  protected readonly isVerified = signal(false);
  protected readonly errorMessage = signal<string | null>(null);

  ngOnInit(): void {
    const token = this.route.snapshot.queryParamMap.get('token');

    if (!token) {
      this.isLoading.set(false);
      this.errorMessage.set('Verification token is missing from this link.');
      return;
    }

    this.verify(token);
  }

  private verify(token: string): void {
    this.authService.verifyEmail(token).subscribe({
      next: () => {
        this.isLoading.set(false);
        this.isVerified.set(true);
      },
      error: (err) => {
        this.isLoading.set(false);
        const serverError = err.error?.error || 'Verification failed. The link may have expired or is invalid.';
        this.errorMessage.set(serverError);
      }
    });
  }
}
