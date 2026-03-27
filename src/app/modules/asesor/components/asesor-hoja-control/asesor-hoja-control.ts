import { Component, OnInit, Inject, PLATFORM_ID, ChangeDetectorRef } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { GrupoService } from '../../../../core/services/grupo.service';
import { FormsModule } from '@angular/forms';
import { forkJoin } from 'rxjs';
import Swal from 'sweetalert2';
import { AuthService } from '../../../../core/services/auth.service';

@Component({
  selector: 'app-asesor-hoja-control',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './asesor-hoja-control.html',
  styleUrl: './asesor-hoja-control.css',
})
export class AsesorHojaControl implements OnInit {
  asesorName: string = '';
  hoyStr: string = '';
  grupoId: string | null = null;
  grupo: any = null;
  miembros: any[] = [];

  pagos: { [miembroId: string]: { monto: number, ahorro: number, solidario: boolean, montoSolidario: number, miembroSolidarioId: string, fecha: string, metodoPago: string, selectedMetodos: string[] } } = {};
  expandedMiembroId: string | null = null;
  showAhorroModal: boolean = false;

  constructor(
    @Inject(PLATFORM_ID) private platformId: Object,
    private route: ActivatedRoute,
    private router: Router,
    private grupoService: GrupoService,
    private authService: AuthService,
    private cdr: ChangeDetectorRef
  ) { }

  ngOnInit(): void {
    const dias = ['Domingo', 'Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes', 'Sabado'];
    this.hoyStr = dias[new Date().getDay()];

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
          this.pagos[m._id] = { monto: 0, ahorro: 0, solidario: false, montoSolidario: 0, miembroSolidarioId: '', fecha: new Date().toISOString().split('T')[0], metodoPago: 'EFECTIVO', selectedMetodos: ['EFECTIVO'] };

          // Encontrar su credito activo para historial
          const credito = creditosAll.find((c: any) => (c.miembro?._id === m._id) || (c.miembro === m._id));
          if (credito) {
            m.creditoId = credito._id;
            m.creditoTotal = credito.saldoTotal || 0;
            m.creditoPendiente = credito.saldoPendiente || 0;
            m.tipoCredito = credito.tipoCredito || 'CC';
            m.totalPagado = m.creditoTotal - m.creditoPendiente;
            m.pagoPactado = credito.pagoPactado || m.pagoPactado || 0;
            m.ahorroTotal = credito.ahorro?.montoTotal || 0;
            m.pagosAhorro = credito.ahorro?.pagosAhorro || [];

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
            m.tipoCredito = '-';
            m.totalPagado = 0;
            m.pagoPactado = m.pagoPactado || 0;
            m.ahorroTotal = 0;
            m.pagosAhorro = [];
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

  get totalEsperado(): number {
    return this.miembros.reduce((sum, m) => sum + (Number(m.pagoPactado) || 0), 0);
  }

  get totalCapturado(): number {
    return this.miembros.reduce((sum, m) => {
      const p = this.pagos[m._id];
      return sum + (Number(p?.monto) || 0) + (Number(p?.montoSolidario) || 0);
    }, 0);
  }

  onPagoChange(): void {
    this.cdr.detectChanges();
  }
  
  toggleMetodo(miembroId: string, metodo: string): void {
    const p = this.pagos[miembroId];
    if (!p.selectedMetodos) p.selectedMetodos = [];
    
    const index = p.selectedMetodos.indexOf(metodo);
    if (index > -1) {
      if (p.selectedMetodos.length > 1) {
        p.selectedMetodos.splice(index, 1);
      }
    } else {
      p.selectedMetodos.push(metodo);
    }
    p.metodoPago = p.selectedMetodos.join(', ');
    this.onPagoChange();
  }

  isMetodoSelected(miembroId: string, metodo: string): boolean {
    return this.pagos[miembroId]?.selectedMetodos?.includes(metodo) || false;
  }

  guardarPagos(): void {
    const pagosFilterIds = Object.keys(this.pagos);
    
    // Primero validamos
    let hasData = false;
    for (const miembroId of pagosFilterIds) {
      const p = this.pagos[miembroId];
      if (p.monto > 0 || p.ahorro > 0 || (p.solidario && p.montoSolidario > 0)) hasData = true;

      // Si marcó solidario pero no seleccionó a quién o un monto > 0
      if (p.solidario) {
        if (!p.miembroSolidarioId || p.montoSolidario <= 0) {
          const m = this.miembros.find(x => x._id === miembroId);
          Swal.fire('Atención', `Por favor completa todos los datos del pago solidario (monto y beneficiario) para ${m?.nombre}`, 'warning');
          return;
        }
      }
    }

    if (!hasData) {
      Swal.fire('Aviso', 'No hay pagos ni ahorros que guardar, debes capturar al menos uno mayor a 0.', 'info');
      return;
    }

    const peticiones: any[] = [];

    for (const miembroId of pagosFilterIds) {
      const p = this.pagos[miembroId];
      const miembroActual = this.miembros.find(m => m._id === miembroId);

      if (!miembroActual || !miembroActual.creditoId) continue;

      // 1. Su propio pago normal
      if (p.monto > 0) {
        peticiones.push(this.grupoService.registrarPago(miembroActual.creditoId, {
          montoPagado: p.monto,
          fechaPago: p.fecha,
          pagoSolidario: false,
          metodoPago: p.metodoPago
        }));
      }

      // 2. Pago solidario (Aportado a otro)
      if (p.solidario && p.montoSolidario > 0 && p.miembroSolidarioId) {
        peticiones.push(this.grupoService.registrarPago(miembroActual.creditoId, {
          montoPagado: p.montoSolidario,
          fechaPago: p.fecha,
          pagoSolidario: true,
          miembro: p.miembroSolidarioId, // El destino (Beneficiario)
          metodoPago: p.metodoPago
        }));
      }

      // 3. Su ahorro
      if (p.ahorro > 0) {
        // Ahorro siempre va a la tarjeta en la que se llenó
        peticiones.push(this.grupoService.registrarAhorro(miembroActual.creditoId, {
          monto: p.ahorro,
          fecha: p.fecha
        }));
      }
    }

    if (peticiones.length === 0) {
      Swal.fire('Aviso', 'No hay peticiones para procesar.', 'info');
      return;
    }

    Swal.fire({
      title: 'Guardando...',
      text: 'Por favor espere',
      allowOutsideClick: false,
      didOpen: () => {
        Swal.showLoading();
      }
    });

    forkJoin(peticiones).subscribe({
      next: (responses) => {
        const isOffline = responses.some(r => r.offline);
        const message = isOffline
          ? 'Los pagos se han guardado localmente (Sin internet) y se subirán al servidor automáticamente al recuperar la señal.'
          : 'Pagos registrados correctamente';

        Swal.fire('Éxito', message, 'success').then(() => {
          this.router.navigate(['/home-asesor']);
        });
      },

      error: (err) => {
        Swal.fire('Error', 'Hubo un error al registrar los pagos', 'error');
        console.error(err);
      }
    });
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

  irAInicio(): void {
    this.router.navigate(['/home-asesor']);
  }

  abrirModalAhorro(): void {
    this.showAhorroModal = true;
  }

  cerrarModalAhorro(): void {
    this.showAhorroModal = false;
  }
}
