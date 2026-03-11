import { Component, OnInit, Inject, PLATFORM_ID, ChangeDetectorRef } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { GrupoService } from '../../../../core/services/grupo.service';

@Component({
  selector: 'app-admin-hoja-control-ind',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './admin-hoja-control-ind.html',
  styleUrl: './admin-hoja-control-ind.css',
})
export class AdminHojaControlInd implements OnInit {
  asesores: any[] = [];

  constructor(
    @Inject(PLATFORM_ID) private platformId: Object,
    private grupoService: GrupoService,
    private cdr: ChangeDetectorRef
  ) { }

  ngOnInit(): void {
    if (isPlatformBrowser(this.platformId)) {
      this.cargarAsesores();
    }
  }

  cargarAsesores(): void {
    this.grupoService.getAsesores().subscribe({
      next: (data) => {
        if (data && Array.isArray(data)) {
          this.asesores = data;
        } else {
          this.asesores = [];
        }
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error('Error al cargar asesores:', err);
        this.asesores = [];
        this.cdr.detectChanges();
      }
    });
  }
}
