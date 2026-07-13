import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface RegisterRequest {
  email: string;
  passwordHash: string; // Wait! The backend RegisterUserCommand takes Email, Password, FullName. Let's match the command properties.
  password?: string;
  fullName: string;
}

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private readonly http = inject(HttpClient);
  // Backend application URL in Development
  private readonly apiUrl = 'http://localhost:5148/api/auth';

  register(userData: { email: string; passwordHash: string; fullName: string }): Observable<any> {
    // Wait, backend's RegisterUserCommand expects: Email, Password, FullName (or matched mapping).
    // Let's write a backend controller action first if it doesn't exist, or make sure our payload matches what backend expects.
    // The backend RegisterUserCommand expects parameters: Email, Password, FullName.
    // If the backend binds directly to RegisterUserCommand, we should send { email, password, fullName }.
    // Let's send { email: userData.email, password: userData.passwordHash, fullName: userData.fullName }.
    // Note: We name it 'password' in the payload so it matches RegisterUserCommand parameter 'Password'.
    return this.http.post(`${this.apiUrl}/register`, {
      email: userData.email,
      password: userData.passwordHash,
      fullName: userData.fullName
    });
  }

  login(credentials: { email: string; passwordHash: string }): Observable<any> {
    return this.http.post(`${this.apiUrl}/login`, {
      email: credentials.email,
      password: credentials.passwordHash
    });
  }

  verifyEmail(email: string, code: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/verify-email`, { email, code });
  }

  getMeetingToken(roomName: string): Observable<{ token: string }> {
    const token = localStorage.getItem('token');
    const headers = {
      Authorization: `Bearer ${token}`
    };
    const baseApi = this.apiUrl.replace('/auth', '');
    return this.http.get<{ token: string }>(`${baseApi}/meetings/token`, {
      params: { roomName },
      headers
    });
  }
}
