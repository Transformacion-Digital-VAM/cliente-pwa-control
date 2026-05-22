import { Component, OnInit, ChangeDetectorRef, Inject, PLATFORM_ID } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import Swal from 'sweetalert2';
import { ClienteService } from '../../../../core/services/cliente.service';
import { AuthService } from '../../../../core/services/auth.service';
import { LocationService } from '../../../../core/services/location.service';

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
    private authService: AuthService,
    private locationService: LocationService
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
        <div class="space-y-3">
          <p class="text-sm text-slate-600 mb-4">Monto pactado: <strong class="text-blue-700">$${pagoPactado}</strong></p>
          
          <div class="flex items-center space-x-3 bg-slate-50 p-2 rounded-lg border border-slate-100">
            <span class="text-xs font-bold text-slate-500 uppercase tracking-widest w-24 text-right">No. Recibo <span class="text-red-500">*</span></span>
            <div class="relative flex-1">
              <span class="absolute left-3 top-2.5 text-slate-400 font-bold">#</span>
              <input type="number" id="numeroRecibo" class="w-full border-slate-300 focus:ring-blue-500 rounded-lg font-bold pl-7 pr-3 py-2" placeholder="000" min="1" required>
            </div>
          </div>

          <div class="flex items-center space-x-3 bg-slate-50 p-2 rounded-lg border border-slate-100">
            <span class="text-xs font-bold text-slate-500 uppercase tracking-widest w-24 text-right">Efectivo</span>
            <div class="relative flex-1">
              <span class="absolute left-3 top-2.5 text-slate-400 font-bold">$</span>
              <input type="number" id="montoEfectivo" class="w-full border-slate-300 focus:ring-blue-500 rounded-lg font-bold pl-7 pr-3 py-2" value="${pagoPactado}" min="0">
            </div>
          </div>

          <div class="flex items-center space-x-3 bg-slate-50 p-2 rounded-lg border border-slate-100">
            <span class="text-xs font-bold text-slate-500 uppercase tracking-widest w-24 text-right">Transf.</span>
            <div class="relative flex-1">
              <span class="absolute left-3 top-2.5 text-slate-400 font-bold">$</span>
              <input type="number" id="montoTransferencia" class="w-full border-slate-300 focus:ring-blue-500 rounded-lg font-bold pl-7 pr-3 py-2" placeholder="0" min="0">
            </div>
          </div>

          <div class="flex items-center space-x-3 bg-slate-50 p-2 rounded-lg border border-slate-100">
            <span class="text-xs font-bold text-slate-500 uppercase tracking-widest w-24 text-right">Depósito</span>
            <div class="relative flex-1">
              <span class="absolute left-3 top-2.5 text-slate-400 font-bold">$</span>
              <input type="number" id="montoDeposito" class="w-full border-slate-300 focus:ring-blue-500 rounded-lg font-bold pl-7 pr-3 py-2" placeholder="0" min="0">
            </div>
          </div>

          <div class="flex items-center space-x-3 bg-slate-50 p-2 rounded-lg border border-slate-100">
            <span class="text-xs font-bold text-slate-500 uppercase tracking-widest w-24 text-right">Tarjeta</span>
            <div class="relative flex-1">
              <span class="absolute left-3 top-2.5 text-slate-400 font-bold">$</span>
              <input type="number" id="montoTarjeta" class="w-full border-slate-300 focus:ring-blue-500 rounded-lg font-bold pl-7 pr-3 py-2" placeholder="0" min="0">
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
        const valRecibo = parseInt((document.getElementById('numeroRecibo') as HTMLInputElement).value) || 0;
        const valEf = parseFloat((document.getElementById('montoEfectivo') as HTMLInputElement).value) || 0;
        const valTr = parseFloat((document.getElementById('montoTransferencia') as HTMLInputElement).value) || 0;
        const valDe = parseFloat((document.getElementById('montoDeposito') as HTMLInputElement).value) || 0;
        const valTa = parseFloat((document.getElementById('montoTarjeta') as HTMLInputElement).value) || 0;

        if (valRecibo <= 0) {
          Swal.showValidationMessage('Ingresa un número de recibo válido');
          return false;
        }

        const monto = valEf + valTr + valDe + valTa;
        if (monto <= 0) {
          Swal.showValidationMessage('Ingresa un monto válido mayor a 0 en algún método');
          return false;
        }

        const metodos = [];
        if (valEf > 0) metodos.push('EFECTIVO');
        if (valTr > 0) metodos.push('TRANSFERENCIA');
        if (valDe > 0) metodos.push('DEPOSITO');
        if (valTa > 0) metodos.push('TARJETA');

        let metodoFinal = 'EFECTIVO';
        if (metodos.length === 1) metodoFinal = metodos[0];
        else if (metodos.length > 1) metodoFinal = 'MIXTO';

        return {
          montoPagado: monto,
          metodoPago: metodoFinal,
          efectivoCredito: valEf,
          transferenciaCredito: valTr,
          depositoCredito: valDe,
          tarjetaCredito: valTa,
          numeroRecibo: valRecibo
        };
      }
    }).then((result) => {
      if (result.isConfirmed) {
        this.procesarPagoEnServidor(result.value);
      }
    });
  }

  procesarPagoEnServidor(pagoData: any): void {
    Swal.fire({
      title: 'Procesando...',
      text: 'Guardando el pago del cliente',
      allowOutsideClick: false,
      didOpen: () => {
        Swal.showLoading();
      }
    });

    pagoData.fechaPago = new Date();

    // Adjuntar ubicación si está disponible (permiso ya solicitado al arrancar)
    const coords = this.locationService.getCurrentCoords();
    if (coords) {
      pagoData.ubicacion = coords;
    }

    // Usamos registrarPago (POST) en el Service en lugar de actualizarCredito (PUT)
    this.clienteService.registrarPago(this.creditoActivo._id, pagoData).subscribe({
      next: (res) => {
        const isOffline = res.offline;
        const message = isOffline
          ? 'El pago se ha guardado localmente (Sin internet) y se subirá automáticamente.'
          : 'Se abonaron $' + pagoData.montoPagado + ' correctamente.';
        Swal.fire({
          icon: 'success',
          title: isOffline ? 'Guardado Local' : '¡Pago Registrado!',
          text: message,
          timer: 3000,
          showConfirmButton: false
        });
        
        // Refrescar datos para que se vea el nuevo pago
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

