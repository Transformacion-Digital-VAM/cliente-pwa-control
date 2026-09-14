import { Component, signal, OnInit, Inject, PLATFORM_ID } from '@angular/core';
import { RouterOutlet, Router } from '@angular/router';
import { Navbar } from './shared/components/navbar/navbar';
import { Footer } from './shared/components/footer/footer';
import { WhatsappButton } from './shared/components/whatsapp-button/whatsapp-button';
import { NotificationService } from './core/services/notification.service';
import { SyncService } from './core/services/sync.service';
import { AuthService } from './core/services/auth.service';
import { LocationService } from './core/services/location.service';
import { isPlatformBrowser } from '@angular/common';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, Footer, Navbar, WhatsappButton],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App implements OnInit {
  protected readonly title = signal('client-pwa-hcontrol');

  // Al inyectar estos servicios aquí, se aseguran de que arranquen con la aplicación
  constructor(
    private notificationService: NotificationService,
    private syncService: SyncService,
    private authService: AuthService,
    private locationService: LocationService,
    private router: Router,
    @Inject(PLATFORM_ID) private platformId: Object
  ) { }

  ngOnInit() {
    if (isPlatformBrowser(this.platformId)) {
      // Solicitar permiso de geolocalización al arrancar y mantener coords en memoria
      this.locationService.initGeolocation();

      this.checkSessionExpiration();
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
          this.checkSessionExpiration();
        }
      });

      // Checar automáticamente cada 5 minutos (300000 ms) mientras el app está abierto
      setInterval(() => {
        this.checkSessionExpiration();
      }, 300000);
    }
  }

  private checkSessionExpiration() {
    const isLoggedIn = localStorage.getItem('isLoggedIn');
    if (isLoggedIn === 'true') {
      const loginDate = localStorage.getItem('loginDate');
      let shouldLogout = false;

      if (loginDate) {
        if (loginDate.includes('-')) {
          const todayStr = new Date().toISOString().split('T')[0];
          shouldLogout = loginDate !== todayStr;
        } else {
          const loginTime = parseInt(loginDate, 10);
          const EIGHT_HOURS = 8 * 60 * 60 * 1000; // 8 horas en milisegundos
          shouldLogout = (Date.now() - loginTime) >= EIGHT_HOURS;
        }
      }

      if (shouldLogout) {
        console.log('[App] Sesión expirada. Cerrando sesión...');
        this.authService.logout();
        this.router.navigate(['/login']);
      }
    }
  }
}
