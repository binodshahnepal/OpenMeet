import { Component, OnInit, OnDestroy, signal, inject, ElementRef, ViewChild } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { AuthService } from '../core/services/auth.service';
import { Room, RoomEvent, RemoteParticipant, Track } from 'livekit-client';

interface ParticipantState {
  identity: string;
  name: string;
  cameraActive: boolean;
  micActive: boolean;
}

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
  private readonly authService = inject(AuthService);

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

  // Remote participants list signal
  protected readonly remoteParticipants = signal<ParticipantState[]>([]);
  protected readonly copied = signal(false);

  private room: Room | null = null;
  private audioElements: HTMLAudioElement[] = [];

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

    // 2. Extract Room Code
    const code = this.route.snapshot.paramMap.get('id');
    if (code) {
      this.roomCode.set(code.toLowerCase());
    } else {
      this.router.navigate(['/lobby']);
      return;
    }

    // 3. Retrieve LiveKit connection token and connect
    this.joinMeeting();
  }

  ngOnDestroy(): void {
    this.leaveRoom();
  }

  private joinMeeting(): void {
    this.status.set('Requesting LiveKit access credentials...');
    
    this.authService.getMeetingToken(this.roomCode()).subscribe({
      next: async (res: { token: string }) => {
        try {
          await this.connectToLiveKit(res.token);
        } catch (err: any) {
          console.error('LiveKit connection error:', err);
          this.errorMessage.set('Failed to establish WebRTC connection to LiveKit server.');
          this.isConnecting.set(false);
        }
      },
      error: (err: any) => {
        console.error('Token retrieval error:', err);
        this.errorMessage.set('Authorization failed. Could not fetch meeting credentials.');
        this.isConnecting.set(false);
      }
    });
  }

  private async connectToLiveKit(token: string): Promise<void> {
    this.status.set('Establishing WebRTC socket connection...');

    // Initialize Room object with adaptive properties
    this.room = new Room({
      adaptiveStream: true,
      dynacast: true
    });

    // Setup Event Listeners
    this.room
      .on(RoomEvent.Connected, () => {
        this.isConnecting.set(false);
        this.status.set('Joined meeting');
        this.updateParticipantsList();
      })
      .on(RoomEvent.ParticipantConnected, () => this.updateParticipantsList())
      .on(RoomEvent.ParticipantDisconnected, (p: RemoteParticipant) => {
        this.cleanupRemoteAudio(p.identity);
        this.updateParticipantsList();
      })
      .on(RoomEvent.TrackSubscribed, (track, publication, participant) => {
        this.handleTrackSubscribed(track, participant);
      })
      .on(RoomEvent.TrackUnsubscribed, (track, publication, participant) => {
        this.handleTrackUnsubscribed(track, participant);
      })
      .on(RoomEvent.TrackMuted, () => this.updateParticipantsList())
      .on(RoomEvent.TrackUnmuted, () => this.updateParticipantsList())
      .on(RoomEvent.TrackPublished, () => this.updateParticipantsList())
      .on(RoomEvent.TrackUnpublished, () => this.updateParticipantsList());

    // Connect to local LiveKit server
    const livekitUrl = 'ws://localhost:7880';
    await this.room.connect(livekitUrl, token);

    // Publish local camera and mic streams
    await this.room.localParticipant.enableCameraAndMicrophone();

    // Map local video feed to template preview element
    const localVideoTracks = Array.from(this.room.localParticipant.videoTrackPublications.values());
    const firstVideoTrack = localVideoTracks.find(pub => pub.track)?.track;
    if (firstVideoTrack) {
      setTimeout(() => {
        if (this.localVideoElement?.nativeElement) {
          firstVideoTrack.attach(this.localVideoElement.nativeElement);
        }
      }, 200);
    }
  }

  private handleTrackSubscribed(track: any, participant: RemoteParticipant): void {
    if (track.kind === 'video') {
      setTimeout(() => {
        const el = document.getElementById(`video_${participant.identity}`) as HTMLVideoElement;
        if (el) {
          track.attach(el);
        }
      }, 300);
    } else if (track.kind === 'audio') {
      // Create isolated audio tag
      const el = document.createElement('audio');
      el.id = `audio_${participant.identity}`;
      el.autoplay = true;
      track.attach(el);
      document.body.appendChild(el);
      this.audioElements.push(el);
    }
    this.updateParticipantsList();
  }

  private handleTrackUnsubscribed(track: any, participant: RemoteParticipant): void {
    track.detach();
    if (track.kind === 'audio') {
      this.cleanupRemoteAudio(participant.identity);
    }
    this.updateParticipantsList();
  }

  private cleanupRemoteAudio(identity: string): void {
    const el = document.getElementById(`audio_${identity}`) as HTMLAudioElement;
    if (el) {
      el.remove();
      this.audioElements = this.audioElements.filter(audio => audio !== el);
    }
  }

  private updateParticipantsList(): void {
    if (!this.room) return;

    const list: ParticipantState[] = [];
    for (const [_, p] of this.room.remoteParticipants) {
      const hasVideo = p.isCameraEnabled;
      const hasAudio = p.isMicrophoneEnabled;

      list.push({
        identity: p.identity,
        name: p.name || p.identity,
        cameraActive: hasVideo,
        micActive: hasAudio
      });

      // Re-attach video element if active
      if (hasVideo) {
        const videoPub = Array.from(p.videoTrackPublications.values()).find(t => t.track);
        const track = videoPub?.track;
        if (track) {
          setTimeout(() => {
            const el = document.getElementById(`video_${p.identity}`) as HTMLVideoElement;
            if (el) {
              track.attach(el);
            }
          }, 200);
        }
      }
    }
    this.remoteParticipants.set(list);
  }

  protected async toggleCamera(): Promise<void> {
    if (this.room?.localParticipant) {
      const nextState = !this.room.localParticipant.isCameraEnabled;
      await this.room.localParticipant.setCameraEnabled(nextState);
      this.cameraActive.set(nextState);
    }
  }

  protected async toggleMic(): Promise<void> {
    if (this.room?.localParticipant) {
      const nextState = !this.room.localParticipant.isMicrophoneEnabled;
      await this.room.localParticipant.setMicrophoneEnabled(nextState);
      this.micActive.set(nextState);
    }
  }

  protected copyMeetingLink(): void {
    const link = window.location.href;
    navigator.clipboard.writeText(link).then(() => {
      this.copied.set(true);
      setTimeout(() => {
        this.copied.set(false);
      }, 2000);
    }).catch(err => {
      console.error('Failed to copy link: ', err);
    });
  }

  protected leaveRoom(): void {
    if (this.room) {
      this.room.disconnect();
      this.room = null;
    }
    // Clean up dynamic audio tags
    this.audioElements.forEach(el => el.remove());
    this.audioElements = [];

    this.router.navigate(['/lobby']);
  }
}
