import { Component, OnInit, OnDestroy, Inject, PLATFORM_ID, ChangeDetectorRef } from '@angular/core';
import { RouterLink, Router, NavigationEnd } from '@angular/router';
import { filter, Subscription } from 'rxjs';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { DexieService } from '../../../core/database/dexie.service';

@Component({
  selector: 'app-navbar',
  standalone: true,
  imports: [RouterLink, CommonModule],
  templateUrl: './navbar.html',
  styleUrl: './navbar.css',
})
export class Navbar implements OnInit, OnDestroy {
  isAsesorPage: boolean = false;
  isLoginPage: boolean = false;
  private routerSubscription?: Subscription;

  constructor(
    private router: Router,
    private dexie: DexieService,
    private cdr: ChangeDetectorRef,
    @Inject(PLATFORM_ID) private platformId: Object
  ) { }

  ngOnInit() {
    this.checkRoute(this.router.url);
    this.routerSubscription = this.router.events.pipe(
      filter(event => event instanceof NavigationEnd)
    ).subscribe((event: any) => {
      this.checkRoute(event.urlAfterRedirects);
    });
  }

  ngOnDestroy() {
    if (this.routerSubscription) {
      this.routerSubscription.unsubscribe();
    }
  }

  private checkRoute(url: string) {
    this.isAsesorPage = url.includes('asesor');
    this.isLoginPage = url.includes('login') || url === '/';
    this.cdr.detectChanges();
  }

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
      const role = localStorage.getItem('userRole');
      return role === 'user' || role === 'asesor';
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