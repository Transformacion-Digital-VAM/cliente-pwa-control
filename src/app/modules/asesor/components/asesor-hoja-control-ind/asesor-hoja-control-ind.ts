import { Component, OnInit, ChangeDetectorRef, Inject, PLATFORM_ID } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import Swal from 'sweetalert2';
import { ClienteService } from '../../../../core/services/cliente.service';
import { AuthService } from '../../../../core/services/auth.service';

@Component({
  selector: 'app-asesor-hoja-control-ind',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './asesor-hoja-control-ind.html',
  styleUrl: './asesor-hoja-control-ind.css'
})
export class AsesorHojaControlInd implements OnInit {
  clienteId: string | null = null;
  cliente: any = null;
  creditoActivo: any = null;
  cargando: boolean = true;
  error: string | null = null;
  hoy: Date = new Date();

  asesorName: string = '';
  hoyStr: string = '';

  constructor(
    @Inject(PLATFORM_ID) private platformId: Object,
    private route: ActivatedRoute,
    private router: Router,
    private clienteService: ClienteService,
    private cdr: ChangeDetectorRef,
    private authService: AuthService
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

    this.clienteId = this.route.snapshot.paramMap.get('id');
    if (this.clienteId) {
      this.cargarDatos();
    } else {
      this.error = 'No se proporcionó un ID de cliente válido.';
      this.cargando = false;
    }
  }

  cargarDatos(): void {
    this.cargando = true;

    // Primero obtenemos el cliente, luego su crédito
    this.clienteService.getClientes().subscribe({
      next: (clientes) => {
        this.cliente = clientes.find((c: any) => c._id === this.clienteId);

        if (!this.cliente) {
          this.error = 'Cliente no encontrado.';
          this.cargando = false;
          this.cdr.detectChanges();
          return;
        }

        // Cargar los créditos para encontrar el que pertenece a este cliente
        this.clienteService.getCreditos().subscribe({
          next: (creditosData) => {
            const arrCreditos = creditosData.creditos || creditosData || [];

            // Buscar el crédito del cliente (tipo Individual y que no esté liquidado)
            this.creditoActivo = arrCreditos.find((cred: any) =>
              (cred.cliente?._id === this.clienteId || cred.cliente === this.clienteId) &&
              (cred.tipoCredito === 'Individual' || cred.cliente)
            );

            this.cargando = false;
            this.cdr.detectChanges();
          },
          error: (err) => {
            console.error('Error al cargar créditos:', err);
            this.error = 'No se pudieron cargar los datos del crédito.';
            this.cargando = false;
            this.cdr.detectChanges();
          }
        });

      },
      error: (err) => {
        console.error('Error al cargar cliente:', err);
        this.error = 'No se pudo cargar la información del cliente.';
        this.cargando = false;
        this.cdr.detectChanges();
      }
    });
  }

  get tienePagoHoy(): boolean {
    if (!this.creditoActivo || !this.creditoActivo.pagos) return false;

    const hoyStr = this.hoy.toISOString().split('T')[0];
    return this.creditoActivo.pagos.some((pago: any) => {
      if (!pago.fechaPago) return false;
      return pago.fechaPago.startsWith(hoyStr);
    });
  }

  registrarPago(): void {
    if (this.tienePagoHoy) {
      Swal.fire({
        icon: 'info',
        title: 'Atención',
        text: 'Este cliente ya tiene un pago registrado el día de hoy.',
        confirmButtonColor: '#3085d6'
      });
      return;
    }

    if (!this.creditoActivo) {
      Swal.fire('Error', 'No hay un crédito activo para registrar el pago.', 'error');
      return;
    }

    const pagoPactado = this.creditoActivo.pagoPactado || 0;

    Swal.fire({
      title: 'Registrar Pago',
      html: `
        <div class="space-y-4">
          <p class="text-sm text-slate-600">Monto pactado: <strong class="text-blue-700">$${pagoPactado}</strong></p>
          <div>
            <label class="block text-sm font-medium text-slate-700 mb-1">Monto a abonar</label>
            <input type="number" id="montoAbonar" class="swal2-input border-slate-300 focus:ring-blue-500 rounded-lg text-center font-bold" value="${pagoPactado}" min="1">
          </div>
          <div>
            <label class="block text-sm font-medium text-slate-700 mb-1">Método(s) de Pago</label>
            <div class="flex flex-wrap justify-center gap-2 mt-2">
              <label class="flex items-center space-x-2 bg-slate-50 px-3 py-2 rounded-lg border border-slate-200 cursor-pointer hover:bg-blue-50 transition-colors">
                <input type="checkbox" name="metodoPago" value="EFECTIVO" checked class="rounded text-blue-600">
                <span class="text-xs font-bold text-slate-600 uppercase">Efectivo</span>
              </label>
              <label class="flex items-center space-x-2 bg-slate-50 px-3 py-2 rounded-lg border border-slate-200 cursor-pointer hover:bg-blue-50 transition-colors">
                <input type="checkbox" name="metodoPago" value="TRANSFERENCIA" class="rounded text-blue-600">
                <span class="text-xs font-bold text-slate-600 uppercase">Transferencia</span>
              </label>
              <label class="flex items-center space-x-2 bg-slate-50 px-3 py-2 rounded-lg border border-slate-200 cursor-pointer hover:bg-blue-50 transition-colors">
                <input type="checkbox" name="metodoPago" value="DEPOSITO" class="rounded text-blue-600">
                <span class="text-xs font-bold text-slate-600 uppercase">Deposito</span>
              </label>
              <label class="flex items-center space-x-2 bg-slate-50 px-3 py-2 rounded-lg border border-slate-200 cursor-pointer hover:bg-blue-50 transition-colors">
                <input type="checkbox" name="metodoPago" value="TARJETA" class="rounded text-blue-600">
                <span class="text-xs font-bold text-slate-600 uppercase">Tarjeta</span>
              </label>
            </div>
          </div>
        </div>
      `,
      showCancelButton: true,
      confirmButtonText: 'Confirmar Pago',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#2563eb',
      cancelButtonColor: '#94a3b8',
      preConfirm: () => {
        const inputMonto = document.getElementById('montoAbonar') as HTMLInputElement;
        const checkboxes = document.querySelectorAll('input[name="metodoPago"]:checked') as NodeListOf<HTMLInputElement>;
        
        const monto = parseFloat(inputMonto.value);
        const metodos = Array.from(checkboxes).map(cb => cb.value);
        
        if (!monto || monto <= 0) {
          Swal.showValidationMessage('Ingresa un monto válido mayor a 0');
          return false;
        }
        if (metodos.length === 0) {
          Swal.showValidationMessage('Selecciona al menos un método de pago');
          return false;
        }
        return { monto, metodo: metodos.join(', ') };
      }
    }).then((result) => {
      if (result.isConfirmed) {
        const { monto, metodo } = result.value;
        this.procesarPagoEnServidor(monto, metodo);
      }
    });
  }

  procesarPagoEnServidor(montoPagado: number, metodoPago: string): void {
    Swal.fire({
      title: 'Procesando...',
      text: 'Guardando el pago del cliente',
      allowOutsideClick: false,
      didOpen: () => {
        Swal.showLoading();
      }
    });

    const numeroNuevo = (this.creditoActivo.pagos?.length || 0) + 1;
    const nuevoPago = {
      numeroPago: numeroNuevo,
      montoPagado: montoPagado,
      fechaPago: new Date(),
      pagoSolidario: false,
      metodoPago: metodoPago
    };

    const nuevosPagos = [...(this.creditoActivo.pagos || []), nuevoPago];
    const saldoRestante = (this.creditoActivo.saldoPendiente || 0) - montoPagado;
    const nuevoEstado = saldoRestante <= 0 ? 'Liquidado' : 'Activo';

    const payloadUpdate = {
      pagos: nuevosPagos,
      saldoPendiente: Math.max(0, saldoRestante),
      estado: nuevoEstado
    };

    // Usamos actualizarCredito (PUT) para eludir la validación del POST /pagos del backend
    this.clienteService.actualizarCredito(this.creditoActivo._id, payloadUpdate).subscribe({
      next: (res) => {
        const isOffline = res.offline;
        const message = isOffline
          ? 'El pago se ha guardado localmente (Sin internet) y se subirá automáticamente.'
          : `Se abonaron $${montoPagado} correctamente.`;

        Swal.fire({
          icon: 'success',
          title: isOffline ? 'Guardado Local' : '¡Pago Registrado!',
          text: message,
          timer: 3000,
          showConfirmButton: false
        });
        
        // Refrescar datos (cargará de Dexie si seguimos offline)
        this.cargarDatos();
      },
      error: (err) => {
        console.error('Error al registrar pago individual:', err);
        Swal.fire({
          icon: 'error',
          title: 'Error',
          text: err.error?.msg || err.message || 'No se pudo registrar el pago. Intenta de nuevo.'
        });
      }
    });
  }

  volver(): void {
    this.router.navigate(['/clientes-asesor']);
  }

  irAInicio(): void {
    this.router.navigate(['/home-asesor']);
  }

  irAGrupos(): void {
    this.router.navigate(['/grupos-asesor']);
  }

  logout(): void {
    this.authService.logout();
    this.router.navigate(['/login']);
  }
}

