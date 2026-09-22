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
          this.asesorName = userObj.nombre || userObj.username || 'Asesor';
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
            const creditosCliente = arrCreditos.filter((cred: any) =>
              (cred.cliente?._id === this.clienteId || cred.cliente === this.clienteId) &&
              (cred.tipoCredito === 'Individual' || cred.cliente)
            );
            this.creditoActivo = creditosCliente.find((cred: any) => cred.estado === 'Activo') || creditosCliente[creditosCliente.length - 1];

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

  /** Consolida pagos que pertenecen a la misma transacción física (mismo recibo y fecha) */
  consolidarPagos(pagos: any[] = []): any[] {
    if (!pagos || pagos.length === 0) return [];
    const grupos: any[] = [];
    const visitados = new Set<number>();

    for (let i = 0; i < pagos.length; i++) {
      if (visitados.has(i)) continue;
      const p1 = pagos[i];
      const grupo = [p1];
      visitados.add(i);

      const fecha1 = p1.fechaPago ? new Date(p1.fechaPago) : null;
      const recibo1 = p1.numeroRecibo ? Number(p1.numeroRecibo) : null;

      if (recibo1 && recibo1 > 0 && fecha1) {
        for (let j = i + 1; j < pagos.length; j++) {
          if (visitados.has(j)) continue;
          const p2 = pagos[j];
          const recibo2 = p2.numeroRecibo ? Number(p2.numeroRecibo) : null;
          const fecha2 = p2.fechaPago ? new Date(p2.fechaPago) : null;

          if (recibo1 === recibo2 && fecha2) {
            const difMs = Math.abs(fecha1.getTime() - fecha2.getTime());
            const mismoDia = fecha1.toDateString() === fecha2.toDateString();
            if (mismoDia || difMs < 10 * 60 * 1000) {
              grupo.push(p2);
              visitados.add(j);
            }
          }
        }
      }

      if (grupo.length === 1) {
        grupos.push({ ...p1 });
      } else {
        const semanaPrincipal = Math.min(...grupo.map(g => Number(g.numeroPago) || 1));
        const montoPagadoTotal = grupo.reduce((sum, g) => sum + (Number(g.montoPagado) || 0), 0);
        const efectivoTotal = grupo.reduce((sum, g) => sum + (Number(g.efectivoCredito) || 0), 0);
        const transferenciaTotal = grupo.reduce((sum, g) => sum + (Number(g.transferenciaCredito) || 0), 0);
        const tarjetaTotal = grupo.reduce((sum, g) => sum + (Number(g.tarjetaCredito) || 0), 0);
        const depositoTotal = grupo.reduce((sum, g) => sum + (Number(g.depositoCredito) || 0), 0);
        const ahorroTotal = grupo.reduce((sum, g) => sum + (Number(g.montoAhorro) || 0), 0);
        const solidarioTotal = grupo.reduce((sum, g) => sum + (Number(g.montoSolidario) || 0), 0);

        const metodos: string[] = [];
        if (efectivoTotal > 0) metodos.push('EFECTIVO');
        if (transferenciaTotal > 0) metodos.push('TRANSFERENCIA');
        if (depositoTotal > 0) metodos.push('DEPOSITO');
        if (tarjetaTotal > 0) metodos.push('TARJETA');
        let metodoFinal = grupo[0].metodoPago || 'EFECTIVO';
        if (metodos.length > 1) metodoFinal = 'MIXTO';
        else if (metodos.length === 1) metodoFinal = metodos[0];

        grupos.push({
          ...grupo[0],
          numeroPago: semanaPrincipal,
          montoPagado: montoPagadoTotal,
          efectivoCredito: efectivoTotal,
          transferenciaCredito: transferenciaTotal,
          tarjetaCredito: tarjetaTotal,
          depositoCredito: depositoTotal,
          montoAhorro: ahorroTotal,
          montoSolidario: solidarioTotal,
          metodoPago: metodoFinal,
          esAdelanto: grupo.every(g => g.esAdelanto),
          esAtraso: grupo.some(g => g.esAtraso && !g.esAdelanto),
          totalPagado: Math.max(...grupo.map(g => Number(g.totalPagado) || 0))
        });
      }
    }
    return grupos;
  }

  /** Historial de pagos con pagos consolidados por recibo */
  get pagosHistorial(): any[] {
    if (!this.creditoActivo || !this.creditoActivo.pagos) return [];
    return this.consolidarPagos(this.creditoActivo.pagos);
  }

  /** Pago registrado hoy (el primero encontrado), o null si no existe */
  get pagoHoy(): any | null {
    if (!this.creditoActivo || !this.creditoActivo.pagos) return null;
    const hoyStr = this.hoy.toISOString().split('T')[0];
    return this.pagosHistorial.find((pago: any) =>
      pago.fechaPago && pago.fechaPago.startsWith(hoyStr)
    ) || null;
  }

  /** Suma de todos los pagos registrados hoy */
  get montoAbonadoHoy(): number {
    if (!this.creditoActivo || !this.creditoActivo.pagos) return 0;
    const hoyStr = this.hoy.toISOString().split('T')[0];
    return this.creditoActivo.pagos
      .filter((pago: any) => pago.fechaPago && pago.fechaPago.startsWith(hoyStr))
      .reduce((sum: number, pago: any) => sum + (pago.montoPagado || 0), 0);
  }

  get totalPagadoHistorico(): number {
    if (!this.creditoActivo || !this.creditoActivo.pagos) return 0;
    return this.creditoActivo.pagos.reduce((sum: number, p: any) => sum + (p.montoPagado || 0), 0);
  }

  get semanaActual(): number {
    return Number(this.creditoActivo?.semanaActual) || 1;
  }

  get semanasIncompletas(): { numero: number; pagado: number; falta: number }[] {
    if (!this.creditoActivo || !this.creditoActivo.pagos) return [];
    const pactado = this.creditoActivo.pagoPactado || 0;
    const semanaActualNum = this.semanaActual;
    const incompletas: { numero: number; pagado: number; falta: number }[] = [];

    let dineroDisponible = this.totalPagadoHistorico;

    for (let s = 1; s < semanaActualNum; s++) {
      const pagadoParaEstaSemana = Math.min(dineroDisponible, pactado);
      const faltaEstaSemana = Math.max(0, pactado - pagadoParaEstaSemana);
      dineroDisponible = Math.max(0, dineroDisponible - pagadoParaEstaSemana);

      if (faltaEstaSemana > 0) {
        incompletas.push({
          numero: s,
          pagado: pagadoParaEstaSemana,
          falta: faltaEstaSemana
        });
      }
    }
    return incompletas;
  }

  get totalDeudaAtrasada(): number {
    return this.semanasIncompletas.reduce((sum, item) => sum + item.falta, 0);
  }

  get abonadoSemanaActual(): number {
    if (!this.creditoActivo || !this.creditoActivo.pagos) return 0;
    const pactado = this.creditoActivo.pagoPactado || 0;
    const semanaActualNum = this.semanaActual;
    // Dinero requerido para cubrir semanas anteriores completas (1 a semanaActual - 1)
    const dineroParaAnteriores = (semanaActualNum - 1) * pactado;
    const dineroParaActualYFuturo = Math.max(0, this.totalPagadoHistorico - dineroParaAnteriores);
    return Math.min(pactado, dineroParaActualYFuturo);
  }

  get faltaSemanaActual(): number {
    const pactado = this.creditoActivo?.pagoPactado || 0;
    return Math.max(0, pactado - this.abonadoSemanaActual);
  }

  get tienePagoHoy(): boolean {
    return this.faltaSemanaActual === 0 && this.totalDeudaAtrasada === 0 && this.montoAbonadoHoy > 0;
  }

  get textoBotonRegistrar(): string {
    if (this.totalDeudaAtrasada > 0) {
      return 'Registrar Pago / Atraso';
    }
    if (this.montoAbonadoHoy > 0 && this.faltaSemanaActual > 0) {
      return 'Registrar Monto Faltante';
    }
    if (this.tienePagoHoy) {
      return 'Registrar Abono Adicional';
    }
    return 'Registrar Pago';
  }

  registrarPago(): void {
    if (!this.creditoActivo) {
      Swal.fire('Error', 'No hay un crédito activo para registrar el pago.', 'error');
      return;
    }

    if (this.creditoActivo.saldoPendiente <= 0) {
      Swal.fire({
        icon: 'info',
        title: 'Crédito Liquidado',
        text: 'Este cliente ya liquidó completamente su crédito.',
        confirmButtonColor: '#3085d6'
      });
      return;
    }

    const pagoPactado = this.creditoActivo.pagoPactado || 0;
    const incompletas = this.semanasIncompletas;
    const semanaActual = this.semanaActual;
    const faltaActual = this.faltaSemanaActual;
    const totalAtrasos = this.totalDeudaAtrasada;
    const totalExigible = totalAtrasos + (faltaActual > 0 ? faltaActual : pagoPactado);
    const folioAnterior = this.pagoHoy?.numeroRecibo;

    // Generar opciones de concepto de pago
    let optionsHtml = '';
    let primerMontoDefault = pagoPactado;

    if (totalAtrasos > 0) {
      primerMontoDefault = totalAtrasos;
      optionsHtml += `<option value="atraso" data-monto="${totalAtrasos}" selected>Atraso pendiente ($${totalAtrasos.toFixed(2)})</option>`;
      optionsHtml += `<option value="actual" data-monto="${faltaActual > 0 ? faltaActual : pagoPactado}">Cuota Semana ${semanaActual} ($${(faltaActual > 0 ? faltaActual : pagoPactado).toFixed(2)})</option>`;
      optionsHtml += `<option value="total" data-monto="${totalExigible}">Total exigible ($${totalExigible.toFixed(2)})</option>`;
      optionsHtml += `<option value="libre" data-monto="">Otro monto libre</option>`;
    } else if (faltaActual > 0) {
      primerMontoDefault = faltaActual;
      optionsHtml += `<option value="actual" data-monto="${faltaActual}" selected>Cuota Semana ${semanaActual} ($${faltaActual.toFixed(2)})</option>`;
      optionsHtml += `<option value="libre" data-monto="">Otro monto libre</option>`;
    } else {
      primerMontoDefault = pagoPactado;
      const semanaSiguiente = semanaActual + 1;
      optionsHtml += `<option value="adelanto" data-monto="${pagoPactado}" selected>Adelanto Semana ${semanaSiguiente} ($${pagoPactado.toFixed(2)})</option>`;
      optionsHtml += `<option value="libre" data-monto="">Otro monto libre</option>`;
    }

    // Banner informativo de atrasos o abonos previos hoy
    let bannerHtml = '';
    if (totalAtrasos > 0) {
      bannerHtml = `
        <div class="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-3 text-left">
          <p class="text-xs font-bold text-amber-700 uppercase tracking-wide mb-1"> Atención: Adeudos de semanas anteriores</p>
          ${incompletas.map(i => `<p class="text-xs text-amber-600">Semana ${i.numero}: <strong>Falta $${i.falta.toFixed(2)}</strong> (Pagado: $${i.pagado.toFixed(2)} / $${pagoPactado})</p>`).join('')}
          <p class="text-xs text-slate-700 mt-1 font-semibold">Semana ${semanaActual} (Actual): <strong>$${(faltaActual > 0 ? faltaActual : pagoPactado).toFixed(2)}</strong> &nbsp;·&nbsp; Total: <strong>$${totalExigible.toFixed(2)}</strong></p>
        </div>`;
    } else if (this.montoAbonadoHoy > 0) {
      bannerHtml = `
        <div class="bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 mb-3 text-left">
          <p class="text-xs font-bold text-blue-700 uppercase tracking-wide mb-1">ℹ Pago registrado hoy</p>
          ${folioAnterior ? `<p class="text-xs text-blue-600">Folio previo: <strong>#${folioAnterior}</strong></p>` : ''}
          <p class="text-xs text-blue-600">Abonado hoy: <strong>$${this.montoAbonadoHoy.toFixed(2)}</strong> &nbsp;·&nbsp; Falta sem. actual: <strong>$${faltaActual.toFixed(2)}</strong></p>
        </div>`;
    }

    Swal.fire({
      title: totalAtrasos > 0 ? 'Registrar Pago / Atraso' : (this.montoAbonadoHoy > 0 ? 'Registrar Abono' : 'Registrar Pago'),
      html: `
        <div class="space-y-3">
          ${bannerHtml}
          
          <div class="flex items-center space-x-3 bg-slate-50 p-2 rounded-lg border border-slate-100">
            <span class="text-xs font-bold text-slate-500 uppercase tracking-widest w-24 text-right">Concepto <span class="text-blue-500">*</span></span>
            <div class="relative flex-1">
              <select id="conceptoPagoSelect" class="w-full border-slate-300 focus:ring-blue-500 rounded-lg font-bold text-xs py-2 px-3">
                ${optionsHtml}
              </select>
            </div>
          </div>

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
              <input type="number" id="montoEfectivo" class="w-full border-slate-300 focus:ring-blue-500 rounded-lg font-bold pl-7 pr-3 py-2" value="${primerMontoDefault}" min="0">
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
      didOpen: () => {
        const selectEl = document.getElementById('conceptoPagoSelect') as HTMLSelectElement;
        const inputEf = document.getElementById('montoEfectivo') as HTMLInputElement;
        if (selectEl && inputEf) {
          selectEl.addEventListener('change', () => {
            const selectedOpt = selectEl.options[selectEl.selectedIndex];
            const sugerido = selectedOpt?.getAttribute('data-monto');
            if (sugerido && Number(sugerido) > 0) {
              inputEf.value = sugerido;
            }
          });
        }
      },
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
          numeroRecibo: valRecibo,
          numeroPago: semanaActual
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

