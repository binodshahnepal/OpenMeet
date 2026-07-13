import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: 'register',
    loadComponent: () => import('./auth/register/register').then(m => m.RegisterComponent)
  },
  {
    path: 'login',
    loadComponent: () => import('./auth/login/login').then(m => m.LoginComponent)
  },
  {
    path: 'verify-email',
    loadComponent: () => import('./auth/verify-email/verify-email').then(m => m.VerifyEmailComponent)
  },
  {
    path: 'lobby',
    loadComponent: () => import('./lobby/lobby').then(m => m.LobbyComponent)
  },
  {
    path: 'meeting/:id',
    loadComponent: () => import('./meeting-room/meeting-room').then(m => m.MeetingRoomComponent)
  },
  {
    path: '',
    redirectTo: 'register',
    pathMatch: 'full'
  }
];
