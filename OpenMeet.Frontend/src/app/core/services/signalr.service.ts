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
