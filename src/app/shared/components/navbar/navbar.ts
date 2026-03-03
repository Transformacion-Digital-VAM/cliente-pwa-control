import { Component } from '@angular/core';
import { RouterLink, Router } from '@angular/router';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { DexieService } from '../../../core/database/dexie.service';
import { Inject, PLATFORM_ID } from '@angular/core';

@Component({
  selector: 'app-navbar',
  standalone: true,
  imports: [RouterLink, CommonModule],
  templateUrl: './navbar.html',
  styleUrl: './navbar.css',
})
export class Navbar {

  constructor(
    private router: Router,
    private dexie: DexieService,
    @Inject(PLATFORM_ID) private platformId: Object
  ) { }

  get isUserLoggedIn(): boolean {
    if (isPlatformBrowser(this.platformId)) {
      return localStorage.getItem('isLoggedIn') === 'true';
    }
    return false;
  }

  get isAdmin(): boolean {
    if (isPlatformBrowser(this.platformId)) {
      return localStorage.getItem('userRole') === 'admin';
    }
    return false;
  }

  get isUser(): boolean {
    if (isPlatformBrowser(this.platformId)) {
      return localStorage.getItem('userRole') === 'user';
    }
    return false;
  }

  // NUEVO: obtener datos del usuario
  get user(): { nombre: string; foto?: string } | null {
    if (isPlatformBrowser(this.platformId)) {
      const userStr = localStorage.getItem('user');
      return userStr ? JSON.parse(userStr) : null;
    }
    return null;
  }

  async logout() {
    if (isPlatformBrowser(this.platformId)) {
      localStorage.removeItem('isLoggedIn');
      localStorage.removeItem('userRole');
      localStorage.removeItem('user');   // limpiamos también el usuario
    }

    try {
      await this.dexie.user_session.clear();
    } catch (e) {
      console.error('Error al limpiar la sesión local:', e);
    }

    this.router.navigate(['/login']);
  }
}