import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface RegisterRequest {
  email: string;
  passwordHash: string;
  fullName: string;
}

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = environment.apiBaseUrl;

  private getHeaders() {
    const token = localStorage.getItem('token');
    return {
      headers: {
        Authorization: `Bearer ${token}`
      }
    };
  }

  register(userData: { email: string; passwordHash: string; fullName: string }): Observable<any> {
    return this.http.post(`${this.apiUrl}/auth/register`, {
      email: userData.email,
      password: userData.passwordHash,
      fullName: userData.fullName
    });
  }

  login(credentials: { email: string; passwordHash: string }): Observable<any> {
    return this.http.post(`${this.apiUrl}/auth/login`, {
      email: credentials.email,
      password: credentials.passwordHash
    });
  }

  verifyEmail(email: string, code: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/auth/verify-email`, { email, code });
  }

  // --- MFA Endpoints ---
  verifyMfaLogin(userId: string, code: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/auth/mfa/verify-login`, { userId, code });
  }

  setupMfa(): Observable<{ secretKey: string; qrCodeUrl: string }> {
    return this.http.post<{ secretKey: string; qrCodeUrl: string }>(
      `${this.apiUrl}/auth/mfa/setup`,
      {},
      this.getHeaders()
    );
  }

  enableMfa(code: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/auth/mfa/enable`, { code }, this.getHeaders());
  }

  disableMfa(): Observable<any> {
    return this.http.post(`${this.apiUrl}/auth/mfa/disable`, {}, this.getHeaders());
  }

  // --- Profile Endpoints ---
  getProfile(): Observable<any> {
    return this.http.get(`${this.apiUrl}/auth/profile`, this.getHeaders());
  }

  updateProfile(fullName: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/auth/profile`, { fullName }, this.getHeaders());
  }

  uploadAvatar(file: File): Observable<{ success: boolean; profilePictureUrl: string }> {
    const formData = new FormData();
    formData.append('file', file);
    return this.http.post<{ success: boolean; profilePictureUrl: string }>(
      `${this.apiUrl}/auth/profile/avatar`,
      formData,
      {
        headers: {
          Authorization: `Bearer ${localStorage.getItem('token')}`
        }
      }
    );
  }

  // --- Meeting Endpoints ---
  getMeetingToken(roomName: string): Observable<{ token: string }> {
    return this.http.get<{ token: string }>(
      `${this.apiUrl}/meetings/token`,
      {
        params: { roomName },
        ...this.getHeaders()
      }
    );
  }

  createMeeting(title: string, scheduledStartTime?: string, meetingCode?: string, passcode?: string): Observable<any> {
    return this.http.post(
      `${this.apiUrl}/meetings`,
      { title, scheduledStartTime, meetingCode, passcode },
      this.getHeaders()
    );
  }

  getScheduledMeetings(): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiUrl}/meetings/scheduled`, this.getHeaders());
  }

  getPastMeetings(): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiUrl}/meetings/past`, this.getHeaders());
  }

  endMeeting(meetingCode: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/meetings/${meetingCode}/end`, {}, this.getHeaders());
  }

  getChatHistory(meetingCode: string): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiUrl}/meetings/${meetingCode}/chat`, this.getHeaders());
  }
}
