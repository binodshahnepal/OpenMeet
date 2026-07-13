import { Component, OnInit, signal, inject } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-lobby',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './lobby.html',
  styleUrl: './lobby.css'
})
export class LobbyComponent implements OnInit {
  private readonly router = inject(Router);

  // User state signals
  protected readonly fullName = signal('');
  protected readonly email = signal('');

  // Input bindings
  protected readonly joinRoomCode = signal('');

  ngOnInit(): void {
    // Retrieve stored user session details
    const storedUser = localStorage.getItem('user');
    const storedToken = localStorage.getItem('token');

    if (!storedUser || !storedToken) {
      // Not authenticated, send back to login
      this.router.navigate(['/login']);
      return;
    }

    try {
      const user = JSON.parse(storedUser);
      this.fullName.set(user.fullName || 'User');
      this.email.set(user.email || '');
    } catch {
      this.router.navigate(['/login']);
    }
  }

  protected createRoom(): void {
    // Generate a secure random Room Code: e.g. "abc-defg-hij"
    const p1 = Math.random().toString(36).substring(2, 5);
    const p2 = Math.random().toString(36).substring(2, 6);
    const p3 = Math.random().toString(36).substring(2, 5);
    const generatedCode = `${p1}-${p2}-${p3}`.toLowerCase();

    this.router.navigate(['/meeting', generatedCode]);
  }

  protected joinRoom(): void {
    const rawCode = this.joinRoomCode().trim().toLowerCase();
    if (!rawCode) return;

    // Clean any spaces or URL path prefixes if the user paste a full link
    let cleanCode = rawCode;
    if (rawCode.includes('/meeting/')) {
      cleanCode = rawCode.split('/meeting/')[1];
    }
    
    cleanCode = cleanCode.replace(/[^a-z0-9-]/g, ''); // keep alphanumeric and dashes

    if (cleanCode) {
      this.router.navigate(['/meeting', cleanCode]);
    }
  }

  protected signOut(): void {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    this.router.navigate(['/login']);
  }
}
