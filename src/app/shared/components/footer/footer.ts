import { Component, OnInit, OnDestroy, Inject, PLATFORM_ID } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { Router } from '@angular/router';
import { SyncService } from '../../../core/services/sync.service';

@Component({
  selector: 'app-footer',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './footer.html',
  styleUrl: './footer.css',
})
export class Footer implements OnInit, OnDestroy {
  syncStatus = { total: 0, pending: 0, failed: 0 };
  private syncTimer?: any;

  constructor(
    private router: Router,
    public syncService: SyncService,
    @Inject(PLATFORM_ID) private platformId: Object
  ) { }

  ngOnInit() {
    if (isPlatformBrowser(this.platformId)) {
      this.actualizarStatus();
      this.syncTimer = setInterval(() => this.actualizarStatus(), 10000);
    }
  }

  ngOnDestroy() {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
    }
  }

  async actualizarStatus() {
    this.syncStatus = await this.syncService.getPendingStatus();
  }

  async reintentar() {
    await this.syncService.retryFailed();
    await this.actualizarStatus();
  }

  get isAsesorPage(): boolean {
    return (this.router.url.includes('asesor') && !this.router.url.includes('mapa-asesores')) || this.router.url.includes('hoja-control-individual') || this.router.url.includes('coordinador');
  }

  get isLoginPage(): boolean {
    return this.router.url.includes('login') || this.router.url === '/';
  }
}
