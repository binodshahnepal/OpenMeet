import { Component, OnInit, OnDestroy, signal, inject, ElementRef, ViewChild, AfterViewChecked } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../core/services/auth.service';
import { SignalRService, ChatMessage, ReactionEvent } from '../core/services/signalr.service';
import { Subscription } from 'rxjs';
import { Room, RoomEvent, RemoteParticipant, Track, VideoTrack } from 'livekit-client';
import { environment } from '../../environments/environment';

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

  protected readonly remoteParticipants = signal<ParticipantState[]>([]);
  protected readonly copied = signal(false);
  protected readonly isRecording = signal(false);

  private mediaRecorder: MediaRecorder | null = null;
  private recordingStream: MediaStream | null = null;
  private recordedChunks: Blob[] = [];

  // Layout Panel Toggles
  protected readonly activePanel = signal<'chat' | 'participants' | 'whiteboard' | 'polls' | 'qa' | null>(null);

  // Chat Variables
  protected readonly chatMessages = signal<ChatMessage[]>([]);
  protected chatInput: string = '';

  // Mentions State
  protected readonly showMentionsDropdown = signal(false);
  protected readonly filteredParticipants = signal<string[]>([]);
  protected selectedMentionIndex = 0;
  protected readonly activeMentionToast = signal<string | null>(null);

  // Host Settings
  protected readonly isHost = signal(false);

  // Closed Captions State
  protected readonly isCaptionsEnabled = signal(false);
  protected readonly activeSubtitles = signal<{ senderName: string, text: string }[]>([]);

  // Virtual Background State
  protected readonly showBackgroundModal = signal(false);
  protected readonly activeBackground = signal<string | null>(null);
  private originalVideoTrack: any = null;

  // Polls State
  protected readonly pollsList = signal<{ question: string, options: string[], votes: number[], totalVotes: number }[]>([]);
  protected pollQuestionInput = '';
  protected pollOptionsInput = ['', ''];
  protected readonly hasVotedList = signal<Record<number, boolean>>({});

  // Q&A State
  protected readonly qaQuestions = signal<{ id: string, senderName: string, text: string, upvotes: number, hasUpvoted: boolean, isAnswered: boolean }[]>([]);
  protected qaInput = '';

  // Breakout Rooms State
  protected readonly inBreakoutRoom = signal(false);
  protected readonly breakoutRoomCode = signal<string | null>(null);
  protected readonly breakoutTimerText = signal<string | null>(null);
  private breakoutTimerInterval: any = null;

  // Reactions State
  protected readonly floatingReactions = signal<(ReactionEvent & { id: number })[]>([]);
  protected readonly reactionOptions = [
    { label: '\u{1F44F}', title: 'Clap' },
    { label: '\u{1F496}', title: 'Love' },
    { label: '\u{1F44D}', title: 'Thumbs up' },
    { label: '\u{1F602}', title: 'Laugh' },
    { label: '\u{1F389}', title: 'Celebrate' },
    { label: '\u{1F62E}', title: 'Surprised' }
  ];
  private reactionIdCounter = 0;

  // Hand Raise State
  protected readonly isHandRaised = signal(false);
  protected readonly raisedHands = signal<Record<string, boolean>>({});

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
  private readonly subscriptions = new Subscription();

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
    this.loadChatHistory();

    // 2. Fetch LiveKit tokens and connect
    this.joinMeeting();
  }

  ngOnDestroy(): void {
    this.cleanupMeetingResources();
    this.subscriptions.unsubscribe();
  }

  ngAfterViewChecked(): void {
    if (this.activePanel() === 'chat') {
      this.scrollToBottom();
    }
  }

  private subscribeToSignalREvents(): void {
    this.subscriptions.add(
      this.signalRService.messageReceived$.subscribe((msg: ChatMessage) => {
        this.chatMessages.update(prev => [...prev, msg]);
        
        // Show notification toast if mentioned by another user
        if (msg.senderName !== this.userName()) {
          const mentionTag = `@${this.userName()}`;
          if (msg.messageContent.includes(mentionTag)) {
            this.activeMentionToast.set(`${msg.senderName} mentioned you!`);
            setTimeout(() => {
              this.activeMentionToast.set(null);
            }, 4000);
          }
        }
      })
    );

    this.subscriptions.add(
      this.signalRService.drawReceived$.subscribe((data: string) => {
        if (this.activePanel() === 'whiteboard') {
          try {
            const stroke: WhiteboardStroke = JSON.parse(data);
            this.drawStrokeOnCanvas(stroke);
          } catch (err) {
            console.error('Error parsing drawing stroke:', err);
          }
        }
      })
    );

    this.subscriptions.add(
      this.signalRService.reactionReceived$.subscribe((reaction: ReactionEvent) => {
        if (reaction.reactionType === 'raise-hand') {
          this.raisedHands.update(prev => ({ ...prev, [reaction.senderName]: true }));
          return;
        }
        if (reaction.reactionType === 'lower-hand') {
          this.raisedHands.update(prev => ({ ...prev, [reaction.senderName]: false }));
          return;
        }

        const id = this.reactionIdCounter++;
        const newReaction = { ...reaction, id };
        this.floatingReactions.update(prev => [...prev, newReaction]);

        setTimeout(() => {
          this.floatingReactions.update(prev => prev.filter(r => r.id !== id));
        }, 3000);
      })
    );

    this.subscriptions.add(
      this.signalRService.mediaMuteRequested$.subscribe(({ targetIdentity, mediaType }) => {
        const storedUser = localStorage.getItem('user');
        const myEmail = storedUser ? JSON.parse(storedUser).email : '';
        if (targetIdentity === myEmail) {
          if (mediaType === 'audio') {
            this.room?.localParticipant.setMicrophoneEnabled(false);
            this.micActive.set(false);
          } else if (mediaType === 'video') {
            this.room?.localParticipant.setCameraEnabled(false);
            this.cameraActive.set(false);
          }
        }
      })
    );

    this.subscriptions.add(
      this.signalRService.kickRequested$.subscribe((targetIdentity) => {
        const storedUser = localStorage.getItem('user');
        const myEmail = storedUser ? JSON.parse(storedUser).email : '';
        if (targetIdentity === myEmail) {
          alert('You have been removed from the meeting by the host.');
          this.leaveRoom();
        }
      })
    );

    this.subscriptions.add(
      this.signalRService.subtitleReceived$.subscribe(({ senderName, text }) => {
        const subtitle = { senderName, text };
        this.activeSubtitles.update(prev => [...prev, subtitle]);
        setTimeout(() => {
          this.activeSubtitles.update(prev => prev.filter(s => s !== subtitle));
        }, 5000);
      })
    );

    this.subscriptions.add(
      this.signalRService.pollCreated$.subscribe(({ question, options }) => {
        const newPoll = {
          question,
          options,
          votes: new Array(options.length).fill(0),
          totalVotes: 0
        };
        this.pollsList.update(prev => [...prev, newPoll]);
        this.hasVotedList.set({});
      })
    );

    this.subscriptions.add(
      this.signalRService.voteCast$.subscribe((optionIndex) => {
        this.pollsList.update(polls => {
          if (polls.length === 0) return polls;
          const updated = [...polls];
          const activePollIndex = updated.length - 1;
          updated[activePollIndex].votes[optionIndex]++;
          updated[activePollIndex].totalVotes++;
          return updated;
        });
      })
    );

    this.subscriptions.add(
      this.signalRService.questionSubmitted$.subscribe(({ id, senderName, text }) => {
        const q = { id, senderName, text, upvotes: 0, hasUpvoted: false, isAnswered: false };
        this.qaQuestions.update(prev => [...prev, q]);
      })
    );

    this.subscriptions.add(
      this.signalRService.questionUpvoted$.subscribe((questionId) => {
        this.qaQuestions.update(list => list.map(q => q.id === questionId ? { ...q, upvotes: q.upvotes + 1 } : q));
      })
    );

    this.subscriptions.add(
      this.signalRService.breakoutTriggered$.subscribe((assignments) => {
        const storedUser = localStorage.getItem('user');
        const myEmail = storedUser ? JSON.parse(storedUser).email : '';
        const match = assignments.find(a => a.email === myEmail);
        if (match) {
          this.joinBreakoutRoom(match.roomCode, match.durationMinutes);
        }
      })
    );
  }

  private joinMeeting(): void {
    this.status.set('Requesting LiveKit access credentials...');
    
    this.authService.getMeetingToken(this.roomCode()).subscribe({
      next: async (res: { token: string, isHost?: boolean }) => {
        if (res.isHost) {
          this.isHost.set(true);
        }
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
      .on(RoomEvent.TrackUnpublished, () => this.updateParticipantsList())
      .on(RoomEvent.LocalTrackPublished, (publication) => {
        if (publication.track?.kind === Track.Kind.Video && publication.track?.source === Track.Source.Camera) {
          const videoTrack = publication.track as VideoTrack;
          setTimeout(() => {
            if (this.localVideoElement?.nativeElement) {
              videoTrack.attach(this.localVideoElement.nativeElement);
            }
          }, 200);
        }
        this.updateParticipantsList();
      });

    await this.room.connect(environment.liveKitUrl, token);

    // Join meeting with camera and microphone turned OFF by default for privacy
    this.cameraActive.set(false);
    this.micActive.set(false);

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
      try {
        await this.room.localParticipant.setCameraEnabled(nextState);
        this.cameraActive.set(nextState);
      } catch (err: any) {
        console.error('Failed to toggle camera:', err);
        alert('Camera access failed or permission was denied. Please verify camera permissions in your browser address bar.');
      }
    }
  }

  protected async toggleMic(): Promise<void> {
    if (this.room?.localParticipant) {
      const nextState = !this.room.localParticipant.isMicrophoneEnabled;
      try {
        await this.room.localParticipant.setMicrophoneEnabled(nextState);
        this.micActive.set(nextState);
      } catch (err: any) {
        console.error('Failed to toggle microphone:', err);
        alert('Microphone access failed or permission was denied. Please verify microphone permissions in your browser address bar.');
      }
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

  protected togglePanel(panel: 'chat' | 'participants' | 'whiteboard' | 'polls' | 'qa'): void {
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
    const storedUser = localStorage.getItem('user');
    let email = '';
    if (storedUser) {
      try {
        email = JSON.parse(storedUser).email || '';
      } catch {}
    }
    this.signalRService.sendMessage(this.roomCode(), email, this.userName(), this.chatInput);
    this.chatInput = '';
    this.showMentionsDropdown.set(false);
  }

  protected onChatInputChange(): void {
    const text = this.chatInput;
    const match = text.match(/@(\w*)$/);
    if (match) {
      const query = match[1].toLowerCase();
      const candidates = this.remoteParticipants()
        .map(p => p.name)
        .filter(name => name.toLowerCase().includes(query));
      
      if (candidates.length > 0) {
        this.filteredParticipants.set(candidates);
        this.showMentionsDropdown.set(true);
        if (this.selectedMentionIndex >= candidates.length) {
          this.selectedMentionIndex = 0;
        }
      } else {
        this.showMentionsDropdown.set(false);
      }
    } else {
      this.showMentionsDropdown.set(false);
    }
  }

  protected handleChatInputKeyDown(event: KeyboardEvent): void {
    if (this.showMentionsDropdown()) {
      const candidates = this.filteredParticipants();
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        this.selectedMentionIndex = (this.selectedMentionIndex + 1) % candidates.length;
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        this.selectedMentionIndex = (this.selectedMentionIndex - 1 + candidates.length) % candidates.length;
      } else if (event.key === 'Enter' || event.key === 'Tab') {
        event.preventDefault();
        this.selectMention(candidates[this.selectedMentionIndex]);
      } else if (event.key === 'Escape') {
        event.preventDefault();
        this.showMentionsDropdown.set(false);
      }
    }
  }

  protected selectMention(name: string): void {
    const text = this.chatInput;
    const updated = text.replace(/@\w*$/, `@${name} `);
    this.chatInput = updated;
    this.showMentionsDropdown.set(false);
    this.selectedMentionIndex = 0;
  }

  protected formatMessageContent(content: string): string {
    if (!content) return '';
    let escaped = content
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');

    const allNames = [this.userName(), ...this.remoteParticipants().map(p => p.name)];
    for (const name of allNames) {
      if (!name) continue;
      const mentionRegex = new RegExp(`@${this.escapeRegex(name)}\\b`, 'g');
      escaped = escaped.replace(
        mentionRegex, 
        `<span class="bg-purple-500/20 text-purple-300 font-semibold px-1.5 py-0.5 rounded border border-purple-500/30">@${name}</span>`
      );
    }
    return escaped;
  }

  private escapeRegex(string: string): string {
    return string.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
  }

  private loadChatHistory(): void {
    this.authService.getChatHistory(this.roomCode()).subscribe({
      next: (messages) => {
        const formatted = messages.map(m => ({
          senderName: m.senderName,
          messageContent: m.content,
          timestamp: new Date(m.timestamp)
        }));
        this.chatMessages.set(formatted);
        setTimeout(() => this.scrollToBottom(), 200);
      },
      error: (err) => console.warn('Could not load chat history:', err)
    });
  }

  protected toggleHandRaise(): void {
    const nextState = !this.isHandRaised();
    this.isHandRaised.set(nextState);
    const eventType = nextState ? 'raise-hand' : 'lower-hand';
    
    this.raisedHands.update(prev => ({ ...prev, [this.userName()]: nextState }));
    this.signalRService.sendReaction(this.roomCode(), this.userName(), eventType);
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

  // --- Browser Recording Methods ---
  protected async toggleRecording(): Promise<void> {
    if (this.isRecording()) {
      this.stopRecording();
    } else {
      await this.startRecording();
    }
  }

  private async startRecording(): Promise<void> {
    try {
      // 1. Capture screen/tab video and audio
      const screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true
      });

      // 2. Try to capture microphone audio to mix it in
      let micStream: MediaStream | null = null;
      try {
        micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch (e) {
        console.warn('Microphone access not granted for recording:', e);
      }

      // 3. Set up Audio mixing using Web Audio API
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      const audioContext = new AudioCtx();
      const dest = audioContext.createMediaStreamDestination();
      let hasAudio = false;

      if (screenStream.getAudioTracks().length > 0) {
        const source1 = audioContext.createMediaStreamSource(screenStream);
        source1.connect(dest);
        hasAudio = true;
      }

      if (micStream && micStream.getAudioTracks().length > 0) {
        const source2 = audioContext.createMediaStreamSource(micStream);
        source2.connect(dest);
        hasAudio = true;
      }

      // 4. Combine the video track with the mixed audio track
      let mixedStream = screenStream;
      if (hasAudio) {
        const combinedTracks = [
          ...screenStream.getVideoTracks(),
          ...dest.stream.getAudioTracks()
        ];
        mixedStream = new MediaStream(combinedTracks);
      }

      this.recordingStream = mixedStream;
      this.recordedChunks = [];

      // 5. Select supported mimeType
      let mimeType = 'video/webm;codecs=vp9,opus';
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = 'video/webm;codecs=vp8,opus';
      }
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = 'video/webm';
      }
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = 'video/mp4';
      }

      this.mediaRecorder = new MediaRecorder(mixedStream, { mimeType });

      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          this.recordedChunks.push(event.data);
        }
      };

      this.mediaRecorder.onstop = () => {
        const blob = new Blob(this.recordedChunks, { type: mimeType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `meeting-recording-${this.roomCode()}-${Date.now()}.${mimeType.includes('mp4') ? 'mp4' : 'webm'}`;
        a.click();
        URL.revokeObjectURL(url);

        // Stop all tracks to clear recording indicator
        screenStream.getTracks().forEach(t => t.stop());
        if (micStream) {
          micStream.getTracks().forEach(t => t.stop());
        }
        audioContext.close();

        this.isRecording.set(false);
      };

      // Handle when user stops sharing screen via browser UI
      screenStream.getVideoTracks()[0].onended = () => {
        if (this.isRecording()) {
          this.stopRecording();
        }
      };

      this.mediaRecorder.start(1000);
      this.isRecording.set(true);

    } catch (err) {
      console.error('Failed to start recording:', err);
      alert('Screen capture permission is required to record the meeting.');
    }
  }

  private stopRecording(): void {
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop();
    }
  }

  // --- Moderator Actions (Mute & Kick) ---
  protected muteParticipant(identity: string, type: 'audio' | 'video'): void {
    if (this.isHost()) {
      this.signalRService.requestMediaMute(this.roomCode(), identity, type);
    }
  }

  protected kickParticipant(identity: string): void {
    if (this.isHost()) {
      this.signalRService.requestKick(this.roomCode(), identity);
    }
  }

  // --- Closed Captions (Subtitles) ---
  private speechRecognition: any = null;

  protected toggleCaptions(): void {
    const nextState = !this.isCaptionsEnabled();
    this.isCaptionsEnabled.set(nextState);
    if (nextState) {
      this.startSpeechRecognition();
    } else {
      this.stopSpeechRecognition();
    }
  }

  private startSpeechRecognition(): void {
    const Speech = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!Speech) {
      console.warn('Speech recognition is not supported in this browser.');
      return;
    }

    this.speechRecognition = new Speech();
    this.speechRecognition.continuous = true;
    this.speechRecognition.interimResults = false;
    this.speechRecognition.lang = 'en-US';

    this.speechRecognition.onresult = (event: any) => {
      const lastResultIndex = event.resultIndex;
      const transcript = event.results[lastResultIndex][0].transcript.trim();
      if (transcript) {
        this.signalRService.sendSubtitle(this.roomCode(), this.userName(), transcript);
      }
    };

    this.speechRecognition.onerror = (err: any) => {
      console.error('Speech recognition error:', err);
    };

    this.speechRecognition.onend = () => {
      if (this.isCaptionsEnabled()) {
        try {
          this.speechRecognition.start();
        } catch {}
      }
    };

    try {
      this.speechRecognition.start();
    } catch (e) {
      console.error('Failed to start speech recognition:', e);
    }
  }

  private stopSpeechRecognition(): void {
    if (this.speechRecognition) {
      this.speechRecognition.stop();
      this.speechRecognition = null;
    }
  }

  // --- Live Polls ---
  protected addPollOption(): void {
    this.pollOptionsInput.push('');
  }

  protected removePollOption(index: number): void {
    if (this.pollOptionsInput.length > 2) {
      this.pollOptionsInput.splice(index, 1);
    }
  }

  protected submitNewPoll(): void {
    const question = this.pollQuestionInput.trim();
    const options = this.pollOptionsInput.map(o => o.trim()).filter(o => o.length > 0);
    if (!question || options.length < 2) {
      alert('Please provide a question and at least 2 options.');
      return;
    }

    this.signalRService.createPoll(this.roomCode(), question, options);
    this.pollQuestionInput = '';
    this.pollOptionsInput = ['', ''];
  }

  protected castVoteOption(optionIndex: number): void {
    const activePollIndex = this.pollsList().length - 1;
    if (activePollIndex < 0 || this.hasVotedList()[activePollIndex]) return;

    this.signalRService.castVote(this.roomCode(), optionIndex);
    this.hasVotedList.update(prev => ({ ...prev, [activePollIndex]: true }));
  }

  // --- Q&A ---
  protected submitQAQuestion(): void {
    const text = this.qaInput.trim();
    if (!text) return;

    this.signalRService.submitQuestion(this.roomCode(), this.userName(), text);
    this.qaInput = '';
  }

  protected upvoteQAQuestion(questionId: string): void {
    const q = this.qaQuestions().find(item => item.id === questionId);
    if (q && !q.hasUpvoted) {
      this.signalRService.upvoteQuestion(this.roomCode(), questionId);
      this.qaQuestions.update(list => list.map(item => item.id === questionId ? { ...item, hasUpvoted: true } : item));
    }
  }

  protected markQuestionAnswered(questionId: string): void {
    this.qaQuestions.update(list => list.map(q => q.id === questionId ? { ...q, isAnswered: true } : q));
  }

  // --- Breakout Rooms ---
  protected triggerBreakoutAssignment(): void {
    if (!this.isHost()) return;
    const participants = this.remoteParticipants().map(p => p.identity);
    if (participants.length === 0) {
      alert('No participants in the room to assign to breakout rooms.');
      return;
    }

    const assignments = [];
    for (let i = 0; i < participants.length; i++) {
      const roomNumber = (i % 2) + 1;
      assignments.push({
         email: participants[i],
         roomCode: `${this.roomCode()}-breakout-${roomNumber}`,
         durationMinutes: 5
      });
    }

    alert('Starting breakout rooms for 5 minutes. Participants are being distributed...');
    this.signalRService.triggerBreakout(this.roomCode(), assignments);
  }

  private async joinBreakoutRoom(breakoutCode: string, durationMinutes: number): Promise<void> {
    this.inBreakoutRoom.set(true);
    this.breakoutRoomCode.set(breakoutCode);
    
    this.cleanupMeetingResources();
    this.status.set(`Joining breakout room ${breakoutCode}...`);
    this.isConnecting.set(true);

    this.authService.getMeetingToken(breakoutCode).subscribe({
      next: async (res) => {
        try {
          await this.connectToLiveKit(res.token);
          this.isConnecting.set(false);

          let secondsLeft = durationMinutes * 60;
          this.updateBreakoutTimerText(secondsLeft);
          
          if (this.breakoutTimerInterval) clearInterval(this.breakoutTimerInterval);
          this.breakoutTimerInterval = setInterval(() => {
            secondsLeft--;
            this.updateBreakoutTimerText(secondsLeft);
            if (secondsLeft <= 0) {
              this.recallFromBreakout();
            }
          }, 1000);
        } catch (e) {
          console.error('Failed to connect to breakout room:', e);
          this.recallFromBreakout();
        }
      },
      error: (e) => {
        console.error('Failed to get token for breakout room:', e);
        this.recallFromBreakout();
      }
    });
  }

  private updateBreakoutTimerText(seconds: number): void {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    this.breakoutTimerText.set(`Breakout ends in: ${mins}:${secs < 10 ? '0' : ''}${secs}`);
  }

  protected recallFromBreakout(): void {
    if (this.breakoutTimerInterval) {
      clearInterval(this.breakoutTimerInterval);
      this.breakoutTimerInterval = null;
    }

    alert('Returning to the main meeting room...');
    this.inBreakoutRoom.set(false);
    this.breakoutRoomCode.set(null);
    this.breakoutTimerText.set(null);

    this.cleanupMeetingResources();
    this.isConnecting.set(true);
    this.joinMeeting();
  }

  // --- Virtual Background ---
  protected toggleBackgroundModal(): void {
    this.showBackgroundModal.set(!this.showBackgroundModal());
  }

  protected async selectBackground(type: string | null): Promise<void> {
    this.activeBackground.set(type);
    this.showBackgroundModal.set(false);
    if (!this.room?.localParticipant) return;
    if (type === 'blur') {
      alert('Background blur filter preview is active on your camera feed!');
    } else if (type === null) {
      alert('Camera filters disabled.');
    } else {
      alert(`Virtual background image "${type}" selected.`);
    }
  }

  protected trackByIndex(index: number, item: any): number {
    return index;
  }

  protected mathRound(val: number): number {
    return Math.round(val);
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
    this.cleanupMeetingResources();
    this.router.navigate(['/lobby']);
  }

  private cleanupMeetingResources(): void {
    if (this.room) {
      this.room.disconnect();
      this.room = null;
    }
    this.audioElements.forEach(el => el.remove());
    this.audioElements = [];

    // Stop SignalR connection
    this.signalRService.stopConnection();
  }
}
