import { Component, OnInit, signal, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../core/services/auth.service';

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './profile.html',
  styleUrl: './profile.css'
})
export class ProfileComponent implements OnInit {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  // Profile data signals
  protected readonly fullName = signal('');
  protected readonly email = signal('');
  protected readonly profilePictureUrl = signal<string | null>(null);
  protected readonly isMfaEnabled = signal(false);

  // MFA Setup signals
  protected readonly showMfaSetup = signal(false);
  protected readonly secretKey = signal('');
  protected readonly qrCodeUrl = signal('');
  protected readonly mfaCode = signal('');

  // Status signals
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly successMessage = signal<string | null>(null);
  protected readonly mfaErrorMessage = signal<string | null>(null);
  protected readonly isLoading = signal(false);

  ngOnInit(): void {
    const token = localStorage.getItem('token');
    if (!token) {
      this.router.navigate(['/login']);
      return;
    }

    this.loadProfile();
  }

  private loadProfile(): void {
    this.isLoading.set(true);
    this.authService.getProfile().subscribe({
      next: (profile) => {
        this.isLoading.set(false);
        this.fullName.set(profile.fullName);
        this.email.set(profile.email);
        this.profilePictureUrl.set(profile.profilePictureUrl);
        this.isMfaEnabled.set(profile.isMfaEnabled);

        // Sync with local session
        localStorage.setItem('user', JSON.stringify(profile));
      },
      error: (err) => {
        this.isLoading.set(false);
        this.errorMessage.set('Failed to load profile settings.');
        console.error(err);
      }
    });
  }

  protected updateProfileName(): void {
    this.errorMessage.set(null);
    this.successMessage.set(null);

    if (!this.fullName().trim()) {
      this.errorMessage.set('Name cannot be empty.');
      return;
    }

    this.isLoading.set(true);
    this.authService.updateProfile(this.fullName().trim()).subscribe({
      next: (profile) => {
        this.isLoading.set(false);
        this.successMessage.set('Profile updated successfully!');
        this.fullName.set(profile.fullName);
        localStorage.setItem('user', JSON.stringify(profile));
      },
      error: (err) => {
        this.isLoading.set(false);
        this.errorMessage.set(err.error?.error || 'Failed to update profile name.');
      }
    });
  }

  protected onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;

    const file = input.files[0];
    
    // Check file type
    if (!file.type.startsWith('image/')) {
      this.errorMessage.set('Only image files are allowed.');
      return;
    }

    this.isLoading.set(true);
    this.authService.uploadAvatar(file).subscribe({
      next: (res) => {
        this.isLoading.set(false);
        this.profilePictureUrl.set(res.profilePictureUrl);
        this.successMessage.set('Profile picture updated successfully!');
        this.loadProfile(); // refresh local storage
      },
      error: (err) => {
        this.isLoading.set(false);
        this.errorMessage.set(err.error?.error || 'Failed to upload profile picture.');
      }
    });
  }

  protected initiateMfa(): void {
    this.mfaErrorMessage.set(null);
    this.isLoading.set(true);

    this.authService.setupMfa().subscribe({
      next: (res) => {
        this.isLoading.set(false);
        this.secretKey.set(res.secretKey);
        // Use a free external qr code generator api to render QR code from TOTP URI
        const googleQrApi = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(res.qrCodeUrl)}`;
        this.qrCodeUrl.set(googleQrApi);
        this.showMfaSetup.set(true);
      },
      error: (err) => {
        this.isLoading.set(false);
        this.errorMessage.set(err.error?.error || 'Failed to initialize MFA setup.');
      }
    });
  }

  protected verifyAndEnableMfa(): void {
    this.mfaErrorMessage.set(null);

    if (!this.mfaCode().trim()) {
      this.mfaErrorMessage.set('Please enter verification code.');
      return;
    }

    this.isLoading.set(true);
    this.authService.enableMfa(this.mfaCode().trim()).subscribe({
      next: () => {
        this.isLoading.set(false);
        this.isMfaEnabled.set(true);
        this.showMfaSetup.set(false);
        this.successMessage.set('MFA enabled successfully!');
        this.loadProfile();
      },
      error: (err) => {
        this.isLoading.set(false);
        this.mfaErrorMessage.set(err.error?.error || 'Invalid code. Please try again.');
      }
    });
  }

  protected disableMfa(): void {
    if (confirm('Are you sure you want to disable Multi-Factor Authentication? Your account will be less secure.')) {
      this.isLoading.set(true);
      this.authService.disableMfa().subscribe({
        next: () => {
          this.isLoading.set(false);
          this.isMfaEnabled.set(false);
          this.successMessage.set('MFA disabled successfully!');
          this.loadProfile();
        },
        error: (err) => {
          this.isLoading.set(false);
          this.errorMessage.set(err.error?.error || 'Failed to disable MFA.');
        }
      });
    }
  }
}
