import { Component, OnInit, Inject, PLATFORM_ID, ChangeDetectorRef } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { GrupoService } from '../../../../core/services/grupo.service';
import { FormsModule } from '@angular/forms';
import { forkJoin } from 'rxjs';

@Component({
  selector: 'app-asesor-hoja-control',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './asesor-hoja-control.html',
  styleUrl: './asesor-hoja-control.css',
})
export class AsesorHojaControl implements OnInit {
  asesorName: string = '';
  grupoId: string | null = null;
  grupo: any = null;
  miembros: any[] = [];

  pagos: { [miembroId: string]: { monto: number, ahorro: number, solidario: boolean, montoSolidario: number, fecha: string } } = {};
  expandedMiembroId: string | null = null;
  showAhorroModal: boolean = false;
  authService: any;

  constructor(
    @Inject(PLATFORM_ID) private platformId: Object,
    private route: ActivatedRoute,
    private router: Router,
    private grupoService: GrupoService,
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
    }

    this.route.paramMap.subscribe(params => {
      this.grupoId = params.get('id');
      if (this.grupoId) {
        this.cargarDatosGrupo(this.grupoId);
      }
    });
  }

  cargarDatosGrupo(id: string): void {
    this.grupoService.getGrupos().subscribe({
      next: (grupos: any[]) => {
        this.grupo = grupos.find(g => g._id === id);
        this.cdr.detectChanges();
      },
      error: (err) => console.error('Error al obtener grupos:', err)
    });

    forkJoin({
      miembrosAll: this.grupoService.getMiembros(),
      creditosAll: this.grupoService.getCreditos()
    }).subscribe({
      next: (res: any) => {
        const miembrosAll = res.miembrosAll || [];
        // Dependiendo si getCreditos devuelve obj.creditos o array
        const creditosAll = res.creditosAll.creditos || res.creditosAll || [];

        this.miembros = miembrosAll.filter((m: any) => (m.grupo?._id === id) || (m.grupo === id));
        this.miembros.forEach(m => {
          // Default state for form
          this.pagos[m._id] = { monto: 0, ahorro: 0, solidario: false, montoSolidario: 0, fecha: new Date().toISOString().split('T')[0] };

          // Encontrar su credito activo para historial
          const credito = creditosAll.find((c: any) => (c.miembro?._id === m._id) || (c.miembro === m._id));
          if (credito) {
            m.creditoTotal = credito.saldoTotal || 0;
            m.creditoPendiente = credito.saldoPendiente || 0;
            m.totalPagado = m.creditoTotal - m.creditoPendiente;

            // Buscar si algun pago historico fue solidario
            m.historialSolidario = credito.pagos && credito.pagos.some((p: any) => p.pagoSolidario === true);
            m.pagosHistoricos = credito.pagos || [];

            // Opcional: Si quieres pre-llenar la forma con el último pago registrado
            if (credito.pagos && credito.pagos.length > 0) {
              const ultimoPago = credito.pagos[credito.pagos.length - 1];
              // this.pagos[m._id].monto = ultimoPago.montoPagado || 0;
              // this.pagos[m._id].solidario = ultimoPago.pagoSolidario || false;
            }
          } else {
            m.creditoTotal = 0;
            m.creditoPendiente = 0;
            m.totalPagado = 0;
            m.historialSolidario = false;
          }
        });
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error('Error al obtener datos combinados (miembros/creditos):', err);
      }
    });
  }

  guardarPagos(): void {
    console.log('Pagos a guardar:', this.pagos);
    alert('Pagos registrados. (Falta endpoint backend)');
    this.router.navigate(['/home-asesor']);
  }

  volver(): void {
    this.router.navigate(['/home-asesor']);
  }

  togglePagoForm(miembroId: string): void {
    if (this.expandedMiembroId === miembroId) {
      this.expandedMiembroId = null;
    } else {
      this.expandedMiembroId = miembroId;
    }
  }

  logout(): void {
    this.authService.logout();
    this.router.navigate(['/login']);
  }

  abrirModalAhorro(): void {
    this.showAhorroModal = true;
  }

  cerrarModalAhorro(): void {
    this.showAhorroModal = false;
  }
}
