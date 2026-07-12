import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: 'register',
    loadComponent: () => import('./auth/register/register').then(m => m.RegisterComponent)
  },
  {
    path: 'verify-email',
    loadComponent: () => import('./auth/verify-email/verify-email').then(m => m.VerifyEmailComponent)
  },
  {
    path: '',
    redirectTo: 'register',
    pathMatch: 'full'
  }
];
