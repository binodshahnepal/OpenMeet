import { Component, OnInit, OnDestroy, signal, inject, ElementRef, ViewChild, AfterViewChecked } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../core/services/auth.service';
import { SignalRService, ChatMessage, ReactionEvent } from '../core/services/signalr.service';
import { Room, RoomEvent, RemoteParticipant, Track } from 'livekit-client';

interface ParticipantState {
  identity: string;
  name: string;
  cameraActive: boolean;
  micActive: boolean;
}

interface WhiteboardStroke {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  color: string;
  lineWidth: number;
  isEraser: boolean;
}

@Component({
  selector: 'app-meeting-room',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './meeting-room.html',
  styleUrl: './meeting-room.css'
})
export class MeetingRoomComponent implements OnInit, OnDestroy, AfterViewChecked {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly authService = inject(AuthService);
  private readonly signalRService = inject(SignalRService);

  @ViewChild('localVideo') localVideoElement!: ElementRef<HTMLVideoElement>;
  @ViewChild('whiteboardCanvas') whiteboardCanvas!: ElementRef<HTMLCanvasElement>;
  @ViewChild('chatScrollContainer') chatScrollContainer!: ElementRef<HTMLDivElement>;

  // Room & Identity Signals
  protected readonly roomCode = signal('');
  protected readonly userName = signal('');
  
  // Status & Media Signals
  protected readonly status = signal('Initializing media equipment...');
  protected readonly isConnecting = signal(true);
  protected readonly cameraActive = signal(true);
  protected readonly micActive = signal(true);
  protected readonly isScreenSharing = signal(false);
  protected readonly errorMessage = signal<string | null>(null);

  // Screen share overlay track
  protected readonly sharedScreenTrack = signal<any | null>(null);
  protected readonly screenShareOwner = signal<string | null>(null);

  // Remote participants list signal
  protected readonly remoteParticipants = signal<ParticipantState[]>([]);
  protected readonly copied = signal(false);

  // Layout Panel Toggles
  protected readonly activePanel = signal<'chat' | 'participants' | 'whiteboard' | null>(null);

  // Chat Variables
  protected readonly chatMessages = signal<ChatMessage[]>([]);
  protected chatInput: string = '';

  // Reactions State
  protected readonly floatingReactions = signal<(ReactionEvent & { id: number })[]>([]);
  private reactionIdCounter = 0;

  // Whiteboard drawing state
  private canvasContext: CanvasRenderingContext2D | null = null;
  private isDrawing = false;
  private lastX = 0;
  private lastY = 0;
  protected selectedColor = '#a855f7'; // Purple-500
  protected isEraser = false;
  protected lineWidth = 3;

  private room: Room | null = null;
  private audioElements: HTMLAudioElement[] = [];

  ngOnInit(): void {
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

    const code = this.route.snapshot.paramMap.get('id');
    if (code) {
      this.roomCode.set(code.toLowerCase());
    } else {
      this.router.navigate(['/lobby']);
      return;
    }

    // 1. Establish SignalR Realtime connection
    this.signalRService.startConnection(this.roomCode(), this.userName());
    this.subscribeToSignalREvents();

    // 2. Fetch LiveKit tokens and connect
    this.joinMeeting();
  }

  ngOnDestroy(): void {
    this.leaveRoom();
  }

  ngAfterViewChecked(): void {
    if (this.activePanel() === 'chat') {
      this.scrollToBottom();
    }
  }

  private subscribeToSignalREvents(): void {
    // Chat Message Event
    this.signalRService.messageReceived$.subscribe((msg: ChatMessage) => {
      this.chatMessages.update(prev => [...prev, msg]);
    });

    // Whiteboard Drawing Event
    this.signalRService.drawReceived$.subscribe((data: string) => {
      if (this.activePanel() === 'whiteboard') {
        try {
          const stroke: WhiteboardStroke = JSON.parse(data);
          this.drawStrokeOnCanvas(stroke);
        } catch (err) {
          console.error('Error parsing drawing stroke:', err);
        }
      }
    });

    // Reaction Event
    this.signalRService.reactionReceived$.subscribe((reaction: ReactionEvent) => {
      const id = this.reactionIdCounter++;
      const newReaction = { ...reaction, id };
      this.floatingReactions.update(prev => [...prev, newReaction]);

      // Float reaction animation lasts ~3 seconds, clean up after
      setTimeout(() => {
        this.floatingReactions.update(prev => prev.filter(r => r.id !== id));
      }, 3000);
    });
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
        if (track.source === Track.Source.ScreenShare) {
          this.sharedScreenTrack.set(track);
          this.screenShareOwner.set(participant.name || participant.identity);
        } else {
          this.handleTrackSubscribed(track, participant);
        }
      })
      .on(RoomEvent.TrackUnsubscribed, (track, publication, participant) => {
        if (track.source === Track.Source.ScreenShare) {
          this.sharedScreenTrack.set(null);
          this.screenShareOwner.set(null);
        } else {
          this.handleTrackUnsubscribed(track, participant);
        }
      })
      .on(RoomEvent.TrackMuted, () => this.updateParticipantsList())
      .on(RoomEvent.TrackUnmuted, () => this.updateParticipantsList())
      .on(RoomEvent.TrackPublished, () => this.updateParticipantsList())
      .on(RoomEvent.TrackUnpublished, () => this.updateParticipantsList());

    const livekitUrl = 'ws://localhost:7880';
    await this.room.connect(livekitUrl, token);

    // Publish local camera and mic streams (handled gracefully if devices are missing or permissions denied)
    try {
      await this.room.localParticipant.enableCameraAndMicrophone();
      this.cameraActive.set(this.room.localParticipant.isCameraEnabled);
      this.micActive.set(this.room.localParticipant.isMicrophoneEnabled);
    } catch (mediaErr: any) {
      console.warn('Could not publish local media streams (camera/mic missing or permission denied):', mediaErr);
      this.cameraActive.set(false);
      this.micActive.set(false);
    }

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

  protected async toggleScreenShare(): Promise<void> {
    if (!this.room) return;
    const nextState = !this.isScreenSharing();
    try {
      await this.room.localParticipant.setScreenShareEnabled(nextState);
      this.isScreenSharing.set(nextState);
    } catch (err) {
      console.error('Failed to toggle screen share:', err);
    }
  }

  protected togglePanel(panel: 'chat' | 'participants' | 'whiteboard'): void {
    if (this.activePanel() === panel) {
      this.activePanel.set(null);
    } else {
      this.activePanel.set(panel);
      if (panel === 'whiteboard') {
        // Initialize canvas drawing context on next tick
        setTimeout(() => this.initWhiteboard(), 100);
      }
    }
  }

  // --- Chat Methods ---
  protected sendChat(): void {
    if (!this.chatInput.trim()) return;
    this.signalRService.sendMessage(this.roomCode(), this.userName(), this.chatInput);
    this.chatInput = '';
  }

  private scrollToBottom(): void {
    try {
      if (this.chatScrollContainer?.nativeElement) {
        this.chatScrollContainer.nativeElement.scrollTop = this.chatScrollContainer.nativeElement.scrollHeight;
      }
    } catch (err) {}
  }

  // --- Reaction Methods ---
  protected triggerReaction(emoji: string): void {
    this.signalRService.sendReaction(this.roomCode(), this.userName(), emoji);
  }

  // --- Collaborative Whiteboard Methods ---
  private initWhiteboard(): void {
    if (!this.whiteboardCanvas) return;
    const canvas = this.whiteboardCanvas.nativeElement;
    
    // Set logical resolution matching display size
    const container = canvas.parentElement;
    if (container) {
      canvas.width = container.clientWidth;
      canvas.height = container.clientHeight;
    }

    this.canvasContext = canvas.getContext('2d');
    if (this.canvasContext) {
      this.canvasContext.lineCap = 'round';
      this.canvasContext.lineJoin = 'round';
    }
  }

  protected selectDrawingTool(isEraserMode: boolean): void {
    this.isEraser = isEraserMode;
  }

  protected selectDrawingColor(color: string): void {
    this.selectedColor = color;
    this.isEraser = false;
  }

  protected clearLocalWhiteboard(): void {
    if (!this.whiteboardCanvas || !this.canvasContext) return;
    const canvas = this.whiteboardCanvas.nativeElement;
    this.canvasContext.clearRect(0, 0, canvas.width, canvas.height);
    
    // Broadcast clear event
    const clearStroke: WhiteboardStroke = {
      x0: 0, y0: 0, x1: 0, y1: 0,
      color: '#000000',
      lineWidth: 0,
      isEraser: true // Handled as full clear if line width is 0
    };
    this.signalRService.sendDraw(this.roomCode(), JSON.stringify(clearStroke));
  }

  protected onCanvasMouseDown(e: MouseEvent): void {
    if (!this.whiteboardCanvas) return;
    this.isDrawing = true;
    const canvas = this.whiteboardCanvas.nativeElement;
    const rect = canvas.getBoundingClientRect();
    this.lastX = e.clientX - rect.left;
    this.lastY = e.clientY - rect.top;
  }

  protected onCanvasMouseMove(e: MouseEvent): void {
    if (!this.isDrawing || !this.whiteboardCanvas || !this.canvasContext) return;
    
    const canvas = this.whiteboardCanvas.nativeElement;
    const rect = canvas.getBoundingClientRect();
    const currentX = e.clientX - rect.left;
    const currentY = e.clientY - rect.top;

    const stroke: WhiteboardStroke = {
      x0: this.lastX,
      y0: this.lastY,
      x1: currentX,
      y1: currentY,
      color: this.isEraser ? '#0a0a0a' : this.selectedColor, // Eraser draws matches base background color
      lineWidth: this.isEraser ? 20 : this.lineWidth,
      isEraser: this.isEraser
    };

    // Draw locally
    this.drawStrokeOnCanvas(stroke);

    // Broadcast to SignalR
    this.signalRService.sendDraw(this.roomCode(), JSON.stringify(stroke));

    this.lastX = currentX;
    this.lastY = currentY;
  }

  protected onCanvasMouseUpOrLeave(): void {
    this.isDrawing = false;
  }

  private drawStrokeOnCanvas(stroke: WhiteboardStroke): void {
    if (!this.canvasContext || !this.whiteboardCanvas) return;

    if (stroke.lineWidth === 0 && stroke.isEraser) {
      // Clear full whiteboard event
      const canvas = this.whiteboardCanvas.nativeElement;
      this.canvasContext.clearRect(0, 0, canvas.width, canvas.height);
      return;
    }

    this.canvasContext.beginPath();
    this.canvasContext.moveTo(stroke.x0, stroke.y0);
    this.canvasContext.lineTo(stroke.x1, stroke.y1);
    this.canvasContext.strokeStyle = stroke.color;
    this.canvasContext.lineWidth = stroke.lineWidth;
    this.canvasContext.stroke();
    this.canvasContext.closePath();
  }

  // --- Meeting End methods ---
  protected copyMeetingLink(): void {
    const link = window.location.origin + '/meeting/' + this.roomCode();
    navigator.clipboard.writeText(link).then(() => {
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 2000);
    }).catch(err => {
      console.error('Failed to copy link: ', err);
    });
  }

  protected leaveRoom(): void {
    if (this.room) {
      this.room.disconnect();
      this.room = null;
    }
    this.audioElements.forEach(el => el.remove());
    this.audioElements = [];

    // Stop SignalR connection
    this.signalRService.stopConnection();

    this.router.navigate(['/lobby']);
  }
}
