import { Component, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { Navbar } from './shared/components/navbar/navbar';
import { Footer } from './shared/components/footer/footer';
import { NotificationService } from './core/services/notification.service';
import { SyncService } from './core/services/sync.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, Footer, Navbar],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {
  protected readonly title = signal('client-pwa-hcontrol');

  // Al inyectar estos servicios aquí, se aseguran de que arranquen con la aplicación
  constructor(
    private notificationService: NotificationService,
    private syncService: SyncService
  ) { }
}

