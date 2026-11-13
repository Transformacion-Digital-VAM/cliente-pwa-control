import { Component, OnInit, Inject, PLATFORM_ID, ChangeDetectorRef } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import Swal from 'sweetalert2';
import { forkJoin } from 'rxjs';
import { MagicoService } from '../../../../core/services/magico.service';
import { GrupoService } from '../../../../core/services/grupo.service';

@Component({
  selector: 'app-magico-lista',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './magico-lista.html',
  styleUrl: './magico-lista.css'
})
export class MagicoLista implements OnInit {
  creditos: any[] = [];
  asesores: any[] = [];
  campanasDisponibles: string[] = [];

  terminoBusqueda: string = '';
  filtroAsesor: string = 'todos';
  filtroEstado: string = 'Activo';
  filtroCampana: string = '';

  cargando: boolean = false;
  esAdmin: boolean = false;

  constructor(
    @Inject(PLATFORM_ID) private platformId: Object,
    private magicoService: MagicoService,
    private grupoService: GrupoService,
    private router: Router,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    if (isPlatformBrowser(this.platformId)) {
      const role = (localStorage.getItem('userRole') || '').toLowerCase();
      this.esAdmin = ['admin', 'superadmin', 'master', 'coordinador'].includes(role);
      this.cargarDatos();
    }
  }

  cargarDatos(): void {
    this.cargando = true;
    forkJoin({
      magicos: this.magicoService.getCreditosMagicos({ estado: 'todos' }),
      asesores: this.grupoService.getAsesores()
    }).subscribe({
      next: ({ magicos, asesores }) => {
        this.creditos = magicos?.creditos || [];
        this.asesores = Array.isArray(asesores) ? asesores : [];

        const setCampanas = new Set<string>();
        for (const c of this.creditos) {
          if (c.campanaClave) setCampanas.add(c.campanaClave);
        }
        this.campanasDisponibles = Array.from(setCampanas).sort().reverse();

        this.cargando = false;
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error('Error al cargar listado de Mágicos:', err);
        this.cargando = false;
        this.cdr.detectChanges();
      }
    });
  }

  get creditosFiltrados(): any[] {
    const term = (this.terminoBusqueda || '').toLowerCase().trim();
    return this.creditos.filter(c => {
      if (this.filtroEstado !== 'todos' && c.estado !== this.filtroEstado) return false;
      if (this.filtroCampana && c.campanaClave !== this.filtroCampana) return false;

      if (this.filtroAsesor !== 'todos') {
        const aId = typeof c.asesor === 'object' ? c.asesor?._id : c.asesor;
        if (String(aId) !== String(this.filtroAsesor)) return false;
      }

      if (term) {
        const miembroNombre = `${c.miembro?.nombre || ''} ${c.miembro?.apellidos || ''}`.toLowerCase();
        const grupoNombre = (c.grupo?.nombre || '').toLowerCase();
        const grupoClave = (c.grupo?.clave || '').toLowerCase();
        return miembroNombre.includes(term) || grupoNombre.includes(term) || grupoClave.includes(term);
      }

      return true;
    });
  }

  get totalSolicitado(): number {
    return this.creditosFiltrados.reduce((s, c) => s + (Number(c.montoSolicitado) || 0), 0);
  }

  get totalSaldoPendiente(): number {
    return this.creditosFiltrados.reduce((s, c) => s + (Number(c.saldoPendiente) || 0), 0);
  }

  verHojaGrupo(c: any): void {
    const grupoId = typeof c.grupo === 'object' ? c.grupo?._id : c.grupo;
    if (grupoId) {
      this.router.navigate(['/magicos-hoja', grupoId]);
    }
  }

  cancelarCredito(c: any): void {
    Swal.fire({
      title: '¿Cancelar Crédito Mágico?',
      text: `Se cancelará el crédito de ${c.miembro?.nombre || ''} ${c.miembro?.apellidos || ''}.`,
      input: 'text',
      inputPlaceholder: 'Motivo de cancelación (opcional)',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Sí, cancelar',
      cancelButtonText: 'Volver',
      confirmButtonColor: '#dc2626'
    }).then(res => {
      if (!res.isConfirmed) return;
      this.magicoService.cancelarCreditoMagico(c._id, res.value || 'Cancelación administrativa').subscribe({
        next: () => {
          Swal.fire('Cancelado', 'El crédito mágico fue cancelado.', 'success');
          this.cargarDatos();
        },
        error: (err) => {
          Swal.fire('Error', err?.error?.msg || 'No se pudo cancelar el crédito.', 'error');
        }
      });
    });
  }
}

