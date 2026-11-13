import { Component, OnInit, Inject, PLATFORM_ID, ChangeDetectorRef } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import Swal from 'sweetalert2';
import { forkJoin } from 'rxjs';
import { GrupoService } from '../../../../core/services/grupo.service';
import { MagicoService } from '../../../../core/services/magico.service';

interface IntegranteMagicoRow {
  _id: string;
  nombreCompleto: string;
  rol: string;
  esMesaDirectiva: boolean;
  apto: boolean;
  motivosBloqueo: string[];
  seleccionado: boolean;
  montoSolicitado: number;
  fechaPrimerPago: string;
  pagoPactado: number;
  saldoTotal: number;
}

@Component({
  selector: 'app-magico-registro',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './magico-registro.html',
  styleUrl: './magico-registro.css'
})
export class MagicoRegistro implements OnInit {
  asesores: any[] = [];
  grupos: any[] = [];
  gruposFiltrados: any[] = [];

  asesorSeleccionadoId: string = '';
  grupoSeleccionadoId: string = '';
  busquedaGrupo: string = '';

  cargandoInicial: boolean = false;
  cargandoElegibilidad: boolean = false;
  guardando: boolean = false;

  elegibilidad: any = null;
  filasIntegrantes: IntegranteMagicoRow[] = [];
  fechaBaseDefault: string = new Date().toISOString().split('T')[0];

  constructor(
    @Inject(PLATFORM_ID) private platformId: Object,
    private grupoService: GrupoService,
    private magicoService: MagicoService,
    private router: Router,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    if (isPlatformBrowser(this.platformId)) {
      this.cargarCatalogos();
    }
  }

  cargarCatalogos(): void {
    this.cargandoInicial = true;
    const userRole = (localStorage.getItem('userRole') || '').toLowerCase();
    const userStr = localStorage.getItem('user');
    let userCoordinacion = '';
    if (userStr) {
      try {
        const u = JSON.parse(userStr);
        userCoordinacion = (u.coordinacion && typeof u.coordinacion === 'object')
          ? String(u.coordinacion._id || u.coordinacion.id || '')
          : String(u.coordinacion || '');
      } catch (e) {}
    }

    forkJoin({
      asesores: this.grupoService.getAsesores(),
      grupos: this.grupoService.getGrupos(true)
    }).subscribe({
      next: ({ asesores, grupos }) => {
        const arrAsesores = Array.isArray(asesores) ? asesores : [];
        const arrGrupos = Array.isArray(grupos) ? grupos : [];
        const limitarCoord = ['master', 'superadmin', 'coordinador', 'ejecutiva'].includes(userRole) && !!userCoordinacion && userRole !== 'superadmin';

        this.asesores = limitarCoord
          ? arrAsesores.filter((a: any) => {
              const aCoord = typeof a.coordinacion === 'object' ? (a.coordinacion?._id || a.coordinacion?.id) : a.coordinacion;
              return aCoord && String(aCoord) === userCoordinacion;
            })
          : arrAsesores;

        this.grupos = limitarCoord
          ? arrGrupos.filter((g: any) => {
              const gCoord = typeof g.coordinacion === 'object' ? (g.coordinacion?._id || g.coordinacion?.id) : g.coordinacion;
              const aId = typeof g.asesor === 'object' ? g.asesor?._id : g.asesor;
              return (gCoord && String(gCoord) === userCoordinacion) || this.asesores.some(a => String(a._id) === String(aId));
            })
          : arrGrupos;

        this.filtrarGrupos();
        this.cargandoInicial = false;
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error('Error cargando catálogos para Mágicos:', err);
        this.cargandoInicial = false;
        this.cdr.detectChanges();
      }
    });
  }

  filtrarGrupos(): void {
    const term = (this.busquedaGrupo || '').toLowerCase().trim();
    this.gruposFiltrados = this.grupos.filter(g => {
      const aId = typeof g.asesor === 'object' ? g.asesor?._id : g.asesor;
      if (this.asesorSeleccionadoId && String(aId) !== String(this.asesorSeleccionadoId)) {
        return false;
      }
      if (term) {
        const nombre = (g.nombre || '').toLowerCase();
        const clave = (g.clave || '').toLowerCase();
        return nombre.includes(term) || clave.includes(term);
      }
      return true;
    });
  }

  onAsesorChange(): void {
    this.grupoSeleccionadoId = '';
    this.elegibilidad = null;
    this.filasIntegrantes = [];
    this.filtrarGrupos();
  }

  onGrupoChange(): void {
    if (!this.grupoSeleccionadoId) {
      this.elegibilidad = null;
      this.filasIntegrantes = [];
      return;
    }

    const grupoObj = this.grupos.find(g => String(g._id) === String(this.grupoSeleccionadoId));
    const aId = typeof grupoObj?.asesor === 'object' ? grupoObj?.asesor?._id : grupoObj?.asesor;
    if (aId && !this.asesorSeleccionadoId) {
      this.asesorSeleccionadoId = String(aId);
      this.filtrarGrupos();
    }

    this.cargarElegibilidad(this.grupoSeleccionadoId);
  }

  cargarElegibilidad(grupoId: string): void {
    this.cargandoElegibilidad = true;
    this.elegibilidad = null;
    this.filasIntegrantes = [];

    this.magicoService.getElegibilidadGrupo(grupoId).subscribe({
      next: (res) => {
        this.elegibilidad = res;
        const montos = res?.configZona?.montosPermitidos || [3000, 4000, 5000];
        const montoDefault = montos[0] || 3000;
        const tasa = Number(res?.configZona?.tasaInteres) || 5;

        this.filasIntegrantes = (res?.integrantes || []).map((m: any) => {
          const calc = this.calcularCuota(montoDefault, tasa);
          return {
            _id: m._id,
            nombreCompleto: m.nombreCompleto,
            rol: m.rol || 'INTEGRANTE',
            esMesaDirectiva: !!m.esMesaDirectiva,
            apto: !!m.apto,
            motivosBloqueo: m.motivosBloqueo || [],
            seleccionado: false,
            montoSolicitado: montoDefault,
            fechaPrimerPago: this.fechaBaseDefault,
            pagoPactado: calc.pagoPactado,
            saldoTotal: calc.saldoTotal
          };
        });

        this.cargandoElegibilidad = false;
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error('Error evaluando elegibilidad de grupo:', err);
        this.cargandoElegibilidad = false;
        Swal.fire('Error', err?.error?.msg || 'No se pudo cargar la elegibilidad del grupo.', 'error');
        this.cdr.detectChanges();
      }
    });
  }

  calcularCuota(monto: number, tasa: number): { pagoPactado: number; saldoTotal: number } {
    const saldoExacto = Number(monto) * (1 + (Number(tasa) / 100) * 4);
    const pagoPactado = Math.round(saldoExacto / 16);
    const saldoTotal = pagoPactado * 16;
    return { pagoPactado, saldoTotal };
  }

  recalcularFila(fila: IntegranteMagicoRow): void {
    const tasa = Number(this.elegibilidad?.configZona?.tasaInteres) || 5;
    const calc = this.calcularCuota(fila.montoSolicitado, tasa);
    fila.pagoPactado = calc.pagoPactado;
    fila.saldoTotal = calc.saldoTotal;
  }

  get seleccionados(): IntegranteMagicoRow[] {
    return this.filasIntegrantes.filter(f => f.seleccionado);
  }

  get cupoDisponibleRestante(): number {
    const disponibles = Number(this.elegibilidad?.cupo?.disponibles) || 0;
    return Math.max(0, disponibles - this.seleccionados.length);
  }

  get totalMontoSeleccionado(): number {
    return this.seleccionados.reduce((s, f) => s + (Number(f.montoSolicitado) || 0), 0);
  }

  get totalPactadoSeleccionado(): number {
    return this.seleccionados.reduce((s, f) => s + (Number(f.pagoPactado) || 0), 0);
  }

  get totalSaldoSeleccionado(): number {
    return this.seleccionados.reduce((s, f) => s + (Number(f.saldoTotal) || 0), 0);
  }

  onToggleSeleccion(fila: IntegranteMagicoRow): void {
    if (!fila.apto) {
      fila.seleccionado = false;
      return;
    }
    const disponibles = Number(this.elegibilidad?.cupo?.disponibles) || 0;
    if (fila.seleccionado && this.seleccionados.length > disponibles) {
      fila.seleccionado = false;
      Swal.fire(
        'Cupo completo (30%)',
        `Este grupo permite máximo ${this.elegibilidad?.cupo?.cupoMaximo || 0} crédito(s) mágico(s) y ya solo quedan ${disponibles} disponible(s).`,
        'warning'
      );
    }
  }

  guardarRegistroMagico(): void {
    if (!this.elegibilidad || !this.grupoSeleccionadoId) {
      Swal.fire('Atención', 'Selecciona un grupo primero.', 'warning');
      return;
    }

    if (!this.elegibilidad?.campana?.enCampana) {
      Swal.fire(
        'Fuera de Campaña',
        'Los Créditos Mágicos solo se pueden registrar en los meses de campaña: Abril, Septiembre y Diciembre.',
        'warning'
      );
      return;
    }

    if (this.seleccionados.length === 0) {
      Swal.fire('Atención', 'Selecciona al menos un integrante apto del grupo.', 'warning');
      return;
    }

    const sinFecha = this.seleccionados.find(f => !f.fechaPrimerPago);
    if (sinFecha) {
      Swal.fire('Atención', `Indica la fecha de primer pago para ${sinFecha.nombreCompleto}.`, 'warning');
      return;
    }

    const payload = {
      grupoId: this.grupoSeleccionadoId,
      asesorId: this.asesorSeleccionadoId || undefined,
      integrantes: this.seleccionados.map(f => ({
        miembroId: f._id,
        montoSolicitado: Number(f.montoSolicitado),
        fechaPrimerPago: f.fechaPrimerPago
      }))
    };

    Swal.fire({
      title: '¿Confirmar Créditos Mágicos?',
      icon: 'question',
      html: `
        <div style="text-align:left;font-size:13px;color:#334155;line-height:1.6;">
          <p><strong>Grupo:</strong> ${this.elegibilidad.grupo.nombre}</p>
          <p><strong>Día/Hora de Pago:</strong> ${this.elegibilidad.grupo.diaPago || '-'} - ${this.elegibilidad.grupo.horaVisita || '-'}</p>
          <p><strong>Campaña:</strong> ${this.elegibilidad.campana.nombreMes} ${this.elegibilidad.campana.anio}</p>
          <p><strong>Tasa (${this.elegibilidad.configZona.zona}):</strong> ${this.elegibilidad.configZona.tasaInteres}% (16 semanas, sin garantía)</p>
          <p><strong>Integrantes seleccionados:</strong> ${this.seleccionados.length}</p>
          <p><strong>Monto total a otorgar:</strong> $${this.totalMontoSeleccionado.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</p>
        </div>
      `,
      showCancelButton: true,
      confirmButtonText: 'Registrar',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#7c3aed'
    }).then(res => {
      if (!res.isConfirmed) return;

      this.guardando = true;
      Swal.fire({ title: 'Guardando...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

      this.magicoService.crearCreditosMagicos(payload).subscribe({
        next: (resp) => {
          this.guardando = false;
          Swal.fire('¡Éxito!', resp?.msg || 'Créditos Mágicos registrados correctamente.', 'success').then(() => {
            this.cargarElegibilidad(this.grupoSeleccionadoId);
          });
        },
        error: (err) => {
          this.guardando = false;
          Swal.fire('Error', err?.error?.msg || 'No se pudieron registrar los Créditos Mágicos.', 'error');
        }
      });
    });
  }
}

