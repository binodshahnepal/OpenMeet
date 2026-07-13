import { Injectable, signal } from '@angular/core';
import * as signalR from '@microsoft/signalr';
import { Subject } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface ChatMessage {
  senderName: string;
  messageContent: string;
  timestamp: Date;
}

export interface ReactionEvent {
  senderName: string;
  reactionType: string;
}

@Injectable({
  providedIn: 'root'
})
export class SignalRService {
  private hubConnection: signalR.HubConnection | null = null;
  
  // Observables for real-time events
  public readonly messageReceived$ = new Subject<ChatMessage>();
  public readonly drawReceived$ = new Subject<string>();
  public readonly reactionReceived$ = new Subject<ReactionEvent>();
  
  public readonly subtitleReceived$ = new Subject<{ senderName: string, text: string }>();
  public readonly pollCreated$ = new Subject<{ question: string, options: string[] }>();
  public readonly voteCast$ = new Subject<number>();
  public readonly questionSubmitted$ = new Subject<{ id: string, senderName: string, text: string }>();
  public readonly questionUpvoted$ = new Subject<string>();
  public readonly mediaMuteRequested$ = new Subject<{ targetIdentity: string, mediaType: string }>();
  public readonly kickRequested$ = new Subject<string>();
  public readonly breakoutTriggered$ = new Subject<any[]>();

  public readonly isConnected = signal(false);

  public startConnection(meetingCode: string, displayName: string): void {
    this.hubConnection = new signalR.HubConnectionBuilder()
      .withUrl(environment.signalRHubUrl)
      .withAutomaticReconnect()
      .build();

    // Register event listeners BEFORE starting to avoid missing messages
    this.hubConnection.on('ReceiveMessage', (senderName: string, messageContent: string) => {
      this.messageReceived$.next({
        senderName,
        messageContent,
        timestamp: new Date()
      });
    });

    this.hubConnection.on('ReceiveDraw', (drawData: string) => {
      this.drawReceived$.next(drawData);
    });

    this.hubConnection.on('ReceiveReaction', (senderName: string, reactionType: string) => {
      this.reactionReceived$.next({ senderName, reactionType });
    });

    this.hubConnection.on('ReceiveSubtitle', (senderName: string, text: string) => {
      this.subtitleReceived$.next({ senderName, text });
    });

    this.hubConnection.on('ReceivePollCreated', (question: string, optionsJson: string) => {
      try {
        const options = JSON.parse(optionsJson);
        this.pollCreated$.next({ question, options });
      } catch (e) {
        console.error('Error parsing poll options:', e);
      }
    });

    this.hubConnection.on('ReceiveVoteCast', (optionIndex: number) => {
      this.voteCast$.next(optionIndex);
    });

    this.hubConnection.on('ReceiveQuestionSubmitted', (id: string, senderName: string, text: string) => {
      this.questionSubmitted$.next({ id, senderName, text });
    });

    this.hubConnection.on('ReceiveQuestionUpvoted', (questionId: string) => {
      this.questionUpvoted$.next(questionId);
    });

    this.hubConnection.on('ReceiveMediaMuteRequest', (targetIdentity: string, mediaType: string) => {
      this.mediaMuteRequested$.next({ targetIdentity, mediaType });
    });

    this.hubConnection.on('ReceiveKickRequest', (targetIdentity: string) => {
      this.kickRequested$.next(targetIdentity);
    });

    this.hubConnection.on('ReceiveBreakoutTrigger', (assignmentsJson: string) => {
      try {
        const assignments = JSON.parse(assignmentsJson);
        this.breakoutTriggered$.next(assignments);
      } catch (e) {
        console.error('Error parsing breakout assignments:', e);
      }
    });

    this.hubConnection.start()
      .then(() => {
        console.log('SignalR connection established successfully.');
        this.isConnected.set(true);
        this.joinMeeting(meetingCode, displayName);
      })
      .catch(err => {
        console.error('Error establishing SignalR connection:', err);
      });
  }

  private joinMeeting(meetingCode: string, displayName: string): void {
    if (this.hubConnection && this.isConnected()) {
      this.hubConnection.invoke('JoinMeeting', meetingCode, displayName)
        .catch(err => console.error('Error invoking JoinMeeting:', err));
    }
  }

  public sendMessage(meetingCode: string, senderEmail: string, senderName: string, messageContent: string): void {
    if (this.hubConnection && this.isConnected()) {
      this.hubConnection.invoke('SendMessage', meetingCode, senderEmail, senderName, messageContent)
        .catch(err => console.error('Error invoking SendMessage:', err));
    }
  }

  public sendDraw(meetingCode: string, drawData: string): void {
    if (this.hubConnection && this.isConnected()) {
      this.hubConnection.invoke('SendDraw', meetingCode, drawData)
        .catch(err => console.error('Error invoking SendDraw:', err));
    }
  }

  public sendReaction(meetingCode: string, senderName: string, reactionType: string): void {
    if (this.hubConnection && this.isConnected()) {
      this.hubConnection.invoke('SendReaction', meetingCode, senderName, reactionType)
        .catch(err => console.error('Error invoking SendReaction:', err));
    }
  }

  public sendSubtitle(meetingCode: string, senderName: string, text: string): void {
    if (this.hubConnection && this.isConnected()) {
      this.hubConnection.invoke('SendSubtitle', meetingCode, senderName, text)
        .catch(err => console.error('Error invoking SendSubtitle:', err));
    }
  }

  public createPoll(meetingCode: string, question: string, options: string[]): void {
    if (this.hubConnection && this.isConnected()) {
      this.hubConnection.invoke('CreatePoll', meetingCode, question, JSON.stringify(options))
        .catch(err => console.error('Error invoking CreatePoll:', err));
    }
  }

  public castVote(meetingCode: string, optionIndex: number): void {
    if (this.hubConnection && this.isConnected()) {
      this.hubConnection.invoke('CastVote', meetingCode, optionIndex)
        .catch(err => console.error('Error invoking CastVote:', err));
    }
  }

  public submitQuestion(meetingCode: string, senderName: string, text: string): void {
    if (this.hubConnection && this.isConnected()) {
      this.hubConnection.invoke('SubmitQuestion', meetingCode, senderName, text)
        .catch(err => console.error('Error invoking SubmitQuestion:', err));
    }
  }

  public upvoteQuestion(meetingCode: string, questionId: string): void {
    if (this.hubConnection && this.isConnected()) {
      this.hubConnection.invoke('UpvoteQuestion', meetingCode, questionId)
        .catch(err => console.error('Error invoking UpvoteQuestion:', err));
    }
  }

  public requestMediaMute(meetingCode: string, targetIdentity: string, mediaType: string): void {
    if (this.hubConnection && this.isConnected()) {
      this.hubConnection.invoke('RequestMediaMute', meetingCode, targetIdentity, mediaType)
        .catch(err => console.error('Error invoking RequestMediaMute:', err));
    }
  }

  public requestKick(meetingCode: string, targetIdentity: string): void {
    if (this.hubConnection && this.isConnected()) {
      this.hubConnection.invoke('RequestKick', meetingCode, targetIdentity)
        .catch(err => console.error('Error invoking RequestKick:', err));
    }
  }

  public triggerBreakout(meetingCode: string, assignments: any[]): void {
    if (this.hubConnection && this.isConnected()) {
      this.hubConnection.invoke('TriggerBreakout', meetingCode, JSON.stringify(assignments))
        .catch(err => console.error('Error invoking TriggerBreakout:', err));
    }
  }

  public stopConnection(): void {
    if (this.hubConnection) {
      this.hubConnection.stop()
        .then(() => {
          this.isConnected.set(false);
          console.log('SignalR connection stopped.');
        })
        .catch(err => console.error('Error stopping SignalR connection:', err));
    }
  }
}
