import { Component, OnInit, signal, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../core/services/auth.service';

@Component({
  selector: 'app-lobby',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './lobby.html',
  styleUrl: './lobby.css'
})
export class LobbyComponent implements OnInit {
  private readonly router = inject(Router);
  private readonly authService = inject(AuthService);

  // User state signals
  protected readonly fullName = signal('');
  protected readonly email = signal('');
  protected readonly profilePictureUrl = signal<string | null>(null);

  // Tabs and lists
  protected readonly activeTab = signal<'actions' | 'scheduled' | 'past'>('actions');
  protected readonly scheduledMeetings = signal<any[]>([]);
  protected readonly pastMeetings = signal<any[]>([]);

  // Input bindings
  protected readonly joinRoomCode = signal('');

  // Scheduling modal signals
  protected readonly showScheduleModal = signal(false);
  protected readonly newMeetingTitle = signal('');
  protected readonly newMeetingDateTime = signal('');
  protected readonly newMeetingCode = signal('');

  // Status signals
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly successMessage = signal<string | null>(null);
  protected readonly isLoading = signal(false);

  ngOnInit(): void {
    const storedUser = localStorage.getItem('user');
    const storedToken = localStorage.getItem('token');

    if (!storedUser || !storedToken) {
      this.router.navigate(['/login']);
      return;
    }

    try {
      const user = JSON.parse(storedUser);
      this.fullName.set(user.fullName || 'User');
      this.email.set(user.email || '');
    } catch {
      this.router.navigate(['/login']);
      return;
    }

    // Load actual profile and meeting list
    this.loadProfile();
    this.loadMeetings();
  }

  private loadProfile(): void {
    this.authService.getProfile().subscribe({
      next: (profile) => {
        this.fullName.set(profile.fullName);
        this.profilePictureUrl.set(profile.profilePictureUrl);
        // Sync user details in localStorage
        localStorage.setItem('user', JSON.stringify(profile));
      },
      error: () => console.warn('Could not fetch updated profile.')
    });
  }

  protected loadMeetings(): void {
    this.authService.getScheduledMeetings().subscribe({
      next: (meetings) => this.scheduledMeetings.set(meetings),
      error: (err) => console.error('Error fetching scheduled meetings:', err)
    });

    this.authService.getPastMeetings().subscribe({
      next: (meetings) => this.pastMeetings.set(meetings),
      error: (err) => console.error('Error fetching past meetings:', err)
    });
  }

  protected createRoom(): void {
    // Generate a secure random Room Code: e.g. "abc-defg-hij"
    const p1 = Math.random().toString(36).substring(2, 5);
    const p2 = Math.random().toString(36).substring(2, 6);
    const p3 = Math.random().toString(36).substring(2, 5);
    const generatedCode = `${p1}-${p2}-${p3}`.toLowerCase();

    this.isLoading.set(true);
    // Persist meeting in the backend database
    this.authService.createMeeting(`Instant Meeting by ${this.fullName()}`, undefined, generatedCode).subscribe({
      next: (meeting) => {
        this.isLoading.set(false);
        this.router.navigate(['/meeting', meeting.meetingCode]);
      },
      error: (err) => {
        this.isLoading.set(false);
        console.error('Failed to create instant meeting database record, navigating directly:', err);
        // Fallback
        this.router.navigate(['/meeting', generatedCode]);
      }
    });
  }

  protected joinRoom(): void {
    const rawCode = this.joinRoomCode().trim().toLowerCase();
    if (!rawCode) return;

    let cleanCode = rawCode;
    if (rawCode.includes('/meeting/')) {
      cleanCode = rawCode.split('/meeting/')[1];
    }
    
    cleanCode = cleanCode.replace(/[^a-z0-9-]/g, '');

    if (cleanCode) {
      this.router.navigate(['/meeting', cleanCode]);
    }
  }

  protected openScheduleModal(): void {
    this.errorMessage.set(null);
    this.successMessage.set(null);
    this.newMeetingTitle.set('');
    
    // Default to tomorrow
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(12, 0, 0, 0);
    
    // Format to yyyy-MM-ddThh:mm for datetime-local input
    const tzOffset = tomorrow.getTimezoneOffset() * 60000;
    const localISOTime = (new Date(tomorrow.getTime() - tzOffset)).toISOString().slice(0, 16);
    this.newMeetingDateTime.set(localISOTime);

    // Generate suggested code
    const p1 = Math.random().toString(36).substring(2, 5);
    const p2 = Math.random().toString(36).substring(2, 6);
    const p3 = Math.random().toString(36).substring(2, 5);
    this.newMeetingCode.set(`${p1}-${p2}-${p3}`.toLowerCase());

    this.showScheduleModal.set(true);
  }

  protected scheduleMeeting(): void {
    this.errorMessage.set(null);
    this.successMessage.set(null);

    if (!this.newMeetingTitle().trim()) {
      this.errorMessage.set('Meeting title is required.');
      return;
    }

    if (!this.newMeetingDateTime()) {
      this.errorMessage.set('Meeting date/time is required.');
      return;
    }

    this.isLoading.set(true);
    const scheduledTime = new Date(this.newMeetingDateTime()).toISOString();

    this.authService.createMeeting(
      this.newMeetingTitle().trim(),
      scheduledTime,
      this.newMeetingCode().trim()
    ).subscribe({
      next: (meeting) => {
        this.isLoading.set(false);
        this.successMessage.set('Meeting scheduled successfully!');
        this.loadMeetings();
        setTimeout(() => {
          this.showScheduleModal.set(false);
        }, 1000);
      },
      error: (err) => {
        this.isLoading.set(false);
        this.errorMessage.set(err.error?.error || 'Failed to schedule meeting. Please try again.');
      }
    });
  }

  protected endOrCancelMeeting(code: string): void {
    if (confirm('Are you sure you want to end or cancel this meeting?')) {
      this.authService.endMeeting(code).subscribe({
        next: () => {
          this.loadMeetings();
        },
        error: (err) => console.error('Error ending meeting:', err)
      });
    }
  }

  protected signOut(): void {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    this.router.navigate(['/login']);
  }
}
