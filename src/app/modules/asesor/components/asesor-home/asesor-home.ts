import { Component, OnInit, Inject, PLATFORM_ID, ChangeDetectorRef } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { Router } from '@angular/router';
import { GrupoService } from '../../../../core/services/grupo.service';
import { AuthService } from '../../../../core/services/auth.service';

@Component({
  selector: 'app-asesor-home',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './asesor-home.html',
  styleUrl: './asesor-home.css',
})
export class AsesorHome implements OnInit {
  gruposHoy: any[] = [];
  hoyStr: string = '';

  // 1. AGREGAMOS LA PROPIEDAD QUE FALTA
  vistaActual: 'grupos' | 'individuales' = 'grupos';
  asesorName: string = '';

  expandedGroupId: string | null = null;
  pagosRegistrados: { [groupId: string]: { monto: number, solidario: boolean, fecha: Date } } = {};

  constructor(
    @Inject(PLATFORM_ID) private platformId: Object,
    private grupoService: GrupoService,
    private authService: AuthService,
    private router: Router,
    private cdr: ChangeDetectorRef
  ) { }

  ngOnInit(): void {
    if (isPlatformBrowser(this.platformId)) {
      const userStr = localStorage.getItem('user');
      if (userStr) {
        try {
          const userObj = JSON.parse(userStr);
          this.asesorName = userObj.username || 'Asesor';
        } catch (e) {
          this.asesorName = 'Asesor';
        }
      }
      this.obtenerGruposDeHoy();
    }
  }

  verDetalleGrupo(grupoId: string): void {
    this.router.navigate(['/hoja-control-asesor', grupoId]);
  }

  verTodosLosGrupos(): void {
    this.router.navigate(['/grupos-asesor']);
  }

  verTodosMisClientes(): void {
    console.log('Ver todos mis clientes individuales (En construcción)');
    // this.router.navigate(['/clientes-asesor']);
  }

  // 2. AGREGAMOS EL MÉTODO PARA CAMBIAR DE PANTALLA
  setVista(nuevaVista: 'grupos' | 'individuales'): void {
    this.vistaActual = nuevaVista;
    // Forzamos la detección de cambios para que la UI responda rápido
    this.cdr.detectChanges();
  }

  logout(): void {
    this.authService.logout();
    this.router.navigate(['/login']);
  }

  obtenerGruposDeHoy(): void {
    const dias = ['Domingo', 'Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes', 'Sabado'];
    const hoy = new Date();
    this.hoyStr = dias[hoy.getDay()];

    this.grupoService.getGrupos().subscribe({
      next: (grupos: any[]) => {
        this.gruposHoy = grupos.filter(g => {
          const diaVisita = g.diaVisita ? g.diaVisita.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase() : '';
          const diaActual = this.hoyStr.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
          return diaVisita === diaActual;
        });
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error('Error al obtener grupos:', err);
      }
    });
  }
}