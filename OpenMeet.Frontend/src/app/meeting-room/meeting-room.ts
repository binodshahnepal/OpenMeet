import { Component, OnInit, OnDestroy, signal, inject, ElementRef, ViewChild } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-meeting-room',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './meeting-room.html',
  styleUrl: './meeting-room.css'
})
export class MeetingRoomComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  @ViewChild('localVideo') localVideoElement!: ElementRef<HTMLVideoElement>;

  // Room & Identity Signals
  protected readonly roomCode = signal('');
  protected readonly userName = signal('');
  
  // Status & Media Signals
  protected readonly status = signal('Initializing media equipment...');
  protected readonly isConnecting = signal(true);
  protected readonly cameraActive = signal(true);
  protected readonly micActive = signal(true);
  protected readonly errorMessage = signal<string | null>(null);

  private localStream: MediaStream | null = null;

  ngOnInit(): void {
    // 1. Session check
    const storedUser = localStorage.getItem('user');
    const storedToken = localStorage.getItem('token');

    if (!storedUser || !storedToken) {
      this.router.navigate(['/login']);
      return;
    }

    try {
      const user = JSON.parse(storedUser);
      this.userName.set(user.fullName || 'Participant');
    } catch {
      this.router.navigate(['/login']);
      return;
    }

    // 2. Extract Room Code from route parameters
    const code = this.route.snapshot.paramMap.get('id');
    if (code) {
      this.roomCode.set(code.toLowerCase());
    } else {
      this.router.navigate(['/lobby']);
      return;
    }

    // 3. Initiate camera / mic preview
    this.setupLocalMedia();
  }

  ngOnDestroy(): void {
    this.releaseMedia();
  }

  private async setupLocalMedia(): Promise<void> {
    try {
      this.localStream = await navigator.mediaDevices.getUserMedia({
        video: { width: 1280, height: 720 },
        audio: true
      });

      this.isConnecting.set(false);
      this.status.set('Connected to local media preview');

      // Hook up stream to HTML video element
      setTimeout(() => {
        if (this.localVideoElement?.nativeElement) {
          this.localVideoElement.nativeElement.srcObject = this.localStream;
        }
      }, 100);

    } catch (err: any) {
      console.error('Error accessing media devices:', err);
      this.isConnecting.set(false);
      this.cameraActive.set(false);
      this.micActive.set(false);
      this.errorMessage.set('Could not access camera or microphone. Please check permissions.');
      this.status.set('Media blocked');
    }
  }

  protected toggleCamera(): void {
    if (this.localStream) {
      const videoTracks = this.localStream.getVideoTracks();
      if (videoTracks.length > 0) {
        const nextState = !videoTracks[0].enabled;
        videoTracks[0].enabled = nextState;
        this.cameraActive.set(nextState);
      }
    }
  }

  protected toggleMic(): void {
    if (this.localStream) {
      const audioTracks = this.localStream.getAudioTracks();
      if (audioTracks.length > 0) {
        const nextState = !audioTracks[0].enabled;
        audioTracks[0].enabled = nextState;
        this.micActive.set(nextState);
      }
    }
  }

  protected leaveRoom(): void {
    this.releaseMedia();
    this.router.navigate(['/lobby']);
  }

  private releaseMedia(): void {
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => track.stop());
      this.localStream = null;
    }
  }
}
