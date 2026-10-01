import { Component, OnInit, Inject, PLATFORM_ID, ChangeDetectorRef } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import Swal from 'sweetalert2';

// Servicios
import { GrupoService } from '../../../../core/services/grupo.service';
import { ClienteService } from '../../../../core/services/cliente.service';
import { UppercaseDirective } from '../../uppercase.directive';

@Component({
  selector: 'app-admin-hoja-control-ind',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, UppercaseDirective],
  templateUrl: './admin-hoja-control-ind.html',
  styleUrl: './admin-hoja-control-ind.css',
})
export class AdminHojaControlInd implements OnInit {
  hojaControlIndForm: FormGroup;

  // Datos para listas y filtros
  asesores: any[] = [];
  clientesTotales: any[] = [];
  clientesFiltrados: any[] = [];
  creditosTotales: any[] = [];
  gruposActivos: any[] = [];
  gruposFiltradosPorAsesor: any[] = [];

  // Control de UI
  showClienteSuggestions: boolean = false;
  isAdmin: boolean = false;

  constructor(
    @Inject(PLATFORM_ID) private platformId: Object,
    private fb: FormBuilder,
    private grupoService: GrupoService,
    private clienteService: ClienteService,
    private cdr: ChangeDetectorRef
  ) {
    this.hojaControlIndForm = this.fb.group({
      idCliente: [''],
      nombreCliente: ['', Validators.required],
      ciclo: [1, [Validators.required, Validators.min(1)]],
      asesor: ['', Validators.required],
      fechaPrimerPago: ['', Validators.required], // El input date necesita YYYY-MM-DD
      montoSolicitado: ['', [Validators.required, Validators.min(0)]],
      tasaInteres: [7, [Validators.required, Validators.min(0)]],
      equivalenciaMeses: [4, [Validators.required, Validators.min(1)]],
      saldoInicial: [0],
      garantia: [0, [Validators.required, Validators.min(0)]],
      porcentajeGarantia: [10, [Validators.required, Validators.min(0)]],
      garantiaPredial: [''],
      tipoPago: ['Semanal', Validators.required],
      noPagos: [16, [Validators.required, Validators.min(1)]],
      diaPago: ['Lunes', Validators.required],
      horaVisita: ['', Validators.required],
      horarioAtencion: [''],
      pagoPactado: [0, [Validators.required, Validators.min(0)]],
      nombreGrupo: [''],
      semanas: [16],
      estadoGrupo: ['CC', Validators.required]
    });
  }

  ngOnInit(): void {
    if (isPlatformBrowser(this.platformId)) {
      const role = localStorage.getItem('userRole') || '';
      this.isAdmin = role === 'admin' || role === 'superadmin' || role === 'master';
      
      this.cargarAsesores();
      this.cargarClientes();
      this.cargarCreditos();
      this.cargarGrupos();
    }
    this.setupSubscriptions();
  }

  setupSubscriptions() {
    const fieldsToWatch = ['montoSolicitado', 'tasaInteres', 'equivalenciaMeses', 'noPagos', 'porcentajeGarantia'];
    fieldsToWatch.forEach(field => {
      this.hojaControlIndForm.get(field)?.valueChanges.subscribe(() => {
        this.calcularPagoYTotal();
      });
    });

    this.hojaControlIndForm.get('asesor')?.valueChanges.subscribe(asesorId => {
      this.filtrarGruposPorAsesor(asesorId);
    });
  }

  filtrarGruposPorAsesor(asesorId: string) {
    if (!asesorId) {
      this.gruposFiltradosPorAsesor = [];
    } else {
      this.gruposFiltradosPorAsesor = this.gruposActivos.filter(g => {
        const gAsesorId = typeof g.asesor === 'object' ? g.asesor?._id : g.asesor;
        return gAsesorId === asesorId;
      });
    }

    // Reset nombreGrupo si el grupo seleccionado ya no está en la lista filtrada
    const currentGrupoId = this.hojaControlIndForm.get('nombreGrupo')?.value;
    if (currentGrupoId && !this.gruposFiltradosPorAsesor.find(g => g._id === currentGrupoId)) {
      this.hojaControlIndForm.get('nombreGrupo')?.setValue('');
    }
  }

  // --- HELPERS PARA OBTENER ÚLTIMO CRÉDITO Y CICLO ---
  getUltimoCreditoCliente(cliente: any): any {
    if (!cliente || !cliente._id || !this.creditosTotales.length) return null;
    const creditosCliente = this.creditosTotales.filter((c: any) => {
      const cClienteId = typeof c.cliente === 'object' ? c.cliente?._id : c.cliente;
      return cClienteId === cliente._id;
    });
    if (creditosCliente.length > 0) {
      // Ordenar por ciclo desc y luego createdAt desc
      const ordenados = [...creditosCliente].sort((a: any, b: any) => (b.ciclo || 0) - (a.ciclo || 0));
      return ordenados[0];
    }
    return null;
  }

  getCicloCliente(cliente: any): number {
    const ultimo = this.getUltimoCreditoCliente(cliente);
    return ultimo?.ciclo || 1;
  }

  getUltimoCreditoActivoCliente(clienteId: string): any {
    const cliente = this.clientesTotales.find(c => c._id === clienteId);
    if (!cliente) return null;
    const creditosCliente = this.creditosTotales.filter((c: any) => {
      const cClienteId = typeof c.cliente === 'object' ? c.cliente?._id : c.cliente;
      return cClienteId === cliente._id;
    });
    if (creditosCliente.length > 0) {
      const ordenados = [...creditosCliente].sort((a: any, b: any) => (b.ciclo || 0) - (a.ciclo || 0));
      const noLiquidado = ordenados.find(c => c.estado !== 'Liquidado' && c.estado !== 'Cancelado');
      if (noLiquidado) return noLiquidado;
      
      const masReciente = ordenados[0];
      if (masReciente && this.calcularSaldoPendienteCredito(masReciente) > 0) {
        return masReciente;
      }
    }
    return null;
  }

  calcularSaldoPendienteCredito(credito: any): number {
    if (!credito) return 0;
    const st = credito.saldoTotal || 0;
    const tp = (credito.pagos || []).reduce((acc: number, p: any) => acc + (p.montoPagado || 0) + (p.montoSolidario || 0), 0);
    return Math.max(0, st - tp);
  }

  abrirModalCancelarCreditoDesdeHoja(clienteId: string, nombreCompleto: string): void {
    const credito = this.getUltimoCreditoActivoCliente(clienteId);
    if (!credito?._id) {
      Swal.fire('Sin adeudo', 'Este cliente no tiene créditos activos con saldo pendiente por saldar.', 'info');
      return;
    }

    const saldo = this.calcularSaldoPendienteCredito(credito);

    Swal.fire({
      title: 'Cancelar Crédito por Justificación',
      html: `
        <div class="text-left text-sm space-y-3">
          <p class="text-slate-700">Vas a saldar a <strong class="text-emerald-700">$0.00</strong> el crédito previo de:<br><strong class="text-blue-700 text-base">${nombreCompleto}</strong></p>
          <div class="bg-amber-50 p-2.5 rounded-xl border border-amber-200">
            <p class="text-xs text-amber-800 font-bold uppercase tracking-wide">Saldo pendiente anterior a liquidar:</p>
            <p class="text-lg font-black text-red-600 font-mono">$${Number(saldo).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
          </div>
          
          <div class="mt-3">
            <label class="block text-xs font-bold text-slate-700 uppercase mb-1">Motivo de Justificación *</label>
            <select id="swal-motivo-hoja" class="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-sm font-semibold text-slate-800 outline-none focus:border-blue-600 focus:bg-white focus:ring-2 focus:ring-blue-100">
              <option value="CANCELACION_REFILL">Cancelación por Refill</option>
              <option value="CAMBIO_CICLO">Cancelación por Cambio de Ciclo</option>
              <option value="OTRO">Otro ajuste justificado</option>
            </select>
          </div>

          <div class="mt-2">
            <label class="block text-xs font-bold text-slate-700 uppercase mb-1">Nota adicional (opcional)</label>
            <input id="swal-notas-hoja" type="text" placeholder="Ej. El saldo remanente se incluyó en nuevo crédito..." class="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-sm outline-none focus:border-blue-600 focus:bg-white focus:ring-2 focus:ring-blue-100">
          </div>
          
          <p class="text-[11px] text-slate-500 mt-2 italic">
            * El crédito anterior pasará a estado Liquidado con saldo $0. El historial de pagos previos se mantendrá para auditoría.
          </p>
        </div>
      `,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Sí, saldar y justificar',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#d97706',
      cancelButtonColor: '#64748b',
      preConfirm: () => {
        const selectEl = document.getElementById('swal-motivo-hoja') as HTMLSelectElement;
        const inputEl = document.getElementById('swal-notas-hoja') as HTMLInputElement;
        const motivo = selectEl ? selectEl.value : 'CANCELACION_REFILL';
        const notas = inputEl ? inputEl.value.trim() : '';
        return { motivo, notas };
      }
    }).then((result) => {
      if (result.isConfirmed && result.value) {
        const { motivo, notas } = result.value;
        const justificacion = motivo === 'CAMBIO_CICLO'
          ? 'Cancelación por Cambio de Ciclo'
          : (motivo === 'CANCELACION_REFILL' ? 'Cancelación por Refill' : 'Ajuste Justificado');

        Swal.fire({
          title: 'Procesando...',
          text: 'Saldando crédito con justificación...',
          allowOutsideClick: false,
          didOpen: () => Swal.showLoading()
        });

        this.grupoService.cancelarCreditoJustificado(credito._id, { motivo, justificacion, notas }).subscribe({
          next: () => {
            // Actualizar localmente el crédito
            credito.saldoPendiente = 0;
            credito.estado = 'Liquidado';
            credito.motivoCancelacion = motivo;
            credito.justificacionCancelacion = notas ? `${justificacion}: ${notas}` : justificacion;

            Swal.fire({
              icon: 'success',
              title: 'Crédito Anterior Saldado a $0',
              text: 'El crédito anterior ha sido cerrado en $0. Ya puedes continuar con el registro del nuevo crédito.',
              confirmButtonColor: '#2563eb'
            });
            this.cargarCreditos(); // recargar listado de creditos
          },
          error: (err: any) => {
            console.error('Error al cancelar crédito justificado', err);
            Swal.fire({
              icon: 'error',
              title: 'Error',
              text: err?.error?.msg || 'No se pudo procesar la cancelación justificada.',
              confirmButtonColor: '#ef4444'
            });
          }
        });
      }
    });
  }

  // --- LÓGICA DE FILTRADO Y SELECCIÓN ---

  onSearchCliente(event: any) {
    const term = (event.target.value || '').toLowerCase();
    this.showClienteSuggestions = true;

    if (!term.trim()) {
      this.clientesFiltrados = [];
      return;
    }

    this.clientesFiltrados = this.clientesTotales.filter(c =>
      `${c.nombre} ${c.apellidos || ''}`.toLowerCase().includes(term)
    );
  }

  seleccionarCliente(cliente: any) {
    const ultimoCredito = this.getUltimoCreditoCliente(cliente);

    // 1. EXTRAER Y FORMATEAR FECHA
    let fechaLimpia = '';
    const fechaOriginal = ultimoCredito?.fechaPrimerPago || cliente.fechaPrimerPago || cliente.createdAt;

    if (fechaOriginal) {
      const d = new Date(fechaOriginal);
      d.setMinutes(d.getMinutes() + d.getTimezoneOffset());
      fechaLimpia = d.toISOString().split('T')[0];
    }

    const ciclo = ultimoCredito?.ciclo || 1;
    const tasaInteres = (ultimoCredito?.tasaInteres !== undefined && ultimoCredito?.tasaInteres !== null)
      ? ultimoCredito.tasaInteres
      : 7;
    const montoSolicitado = ultimoCredito?.montoSolicitado !== undefined ? ultimoCredito.montoSolicitado : '';
    const equivalenciaMeses = ultimoCredito?.equivalenciaMeses || 4;
    const noPagos = ultimoCredito?.semanas || 16;
    const porcentajeGarantia = (ultimoCredito?.porcentajeGarantia !== undefined && ultimoCredito?.porcentajeGarantia !== null)
      ? ultimoCredito.porcentajeGarantia
      : 10;
    const garantiaPredial = ultimoCredito?.garantiaPredial || '';
    const tipoPago = ultimoCredito?.frecuenciaPago || cliente.tipoPago || 'Semanal';

    // 2. PARCHEAR VALORES
    this.hojaControlIndForm.patchValue({
      idCliente: cliente._id,
      nombreCliente: `${cliente.nombre} ${cliente.apellidos || ''}`.trim(),
      asesor: cliente.asesor?._id || cliente.asesor || '',
      ciclo: ciclo,
      tasaInteres: tasaInteres,
      montoSolicitado: montoSolicitado,
      equivalenciaMeses: equivalenciaMeses,
      noPagos: noPagos,
      porcentajeGarantia: porcentajeGarantia,
      garantiaPredial: garantiaPredial,
      fechaPrimerPago: fechaLimpia,
      diaPago: cliente.diaPago || 'Lunes',
      tipoPago: tipoPago,
      horaVisita: cliente.horaVisita || '',
      nombreGrupo: cliente.grupo || ultimoCredito?.grupoOpcional || ''
    });

    this.calcularPagoYTotal();
    this.showClienteSuggestions = false;
    this.cdr.detectChanges();
  }

  hideClienteSuggestions() {
    setTimeout(() => {
      this.showClienteSuggestions = false;
      this.cdr.detectChanges();
    }, 250);
  }

  // --- CÁLCULOS ---

  calcularPagoYTotal() {
    const values = this.hojaControlIndForm.getRawValue();
    const monto = values.montoSolicitado || 0;
    const tasa = values.tasaInteres || 0;
    const meses = values.equivalenciaMeses || 4;
    const noPagos = values.noPagos || 16;
    const porcentajeGarantia = values.porcentajeGarantia || 0;

    const garantiaCalculada = monto * (porcentajeGarantia / 100);

    if (noPagos > 0) {
      const interes = monto * (tasa / 100) * meses;
      const saldoTotal = interes + monto;
      const pagoPactado = saldoTotal / noPagos;

      this.hojaControlIndForm.patchValue({
        pagoPactado: Number(pagoPactado.toFixed(2)),
        garantia: Number(garantiaCalculada.toFixed(2)),
        saldoInicial: saldoTotal,
        semanas: noPagos
      }, { emitEvent: false });
    }
  }

  // --- CARGA DE DATOS ---

  cargarAsesores(): void {
    const userRole = localStorage.getItem('userRole') || '';
    const userStr = localStorage.getItem('user');
    let userCoordinacion = '';
    if (userStr) {
      try {
        const u = JSON.parse(userStr);
        userCoordinacion = u.coordinacion || '';
      } catch (e) {}
    }

    this.grupoService.getAsesores().subscribe({
      next: (data) => {
        const allAsesores = Array.isArray(data) ? data : [];
        if ((userRole === 'master' || userRole === 'superadmin' || userRole === 'coordinador' || userRole === 'ejecutiva') && userCoordinacion) {
          this.asesores = allAsesores.filter((a: any) => {
            const aCoord = a.coordinacion;
            const aCoordId = (aCoord && typeof aCoord === 'object') ? (aCoord._id || aCoord.id) : aCoord;
            return aCoordId && String(aCoordId) === String(userCoordinacion);
          });
        } else {
          this.asesores = allAsesores;
        }
        this.cdr.detectChanges();
      },
      error: (err) => console.error('Error al cargar asesores:', err)
    });
  }

  cargarClientes(): void {
    this.clienteService.getClientes().subscribe({
      next: (data) => {
        this.clientesTotales = data || [];
      },
      error: (err) => console.error('Error al cargar clientes:', err)
    });
  }

  cargarCreditos(): void {
    this.clienteService.getCreditos().subscribe({
      next: (res) => {
        this.creditosTotales = res?.creditos || res || [];
      },
      error: (err) => console.error('Error al cargar créditos:', err)
    });
  }

  cargarGrupos(): void {
    this.grupoService.getGrupos().subscribe({
      next: (data: any) => {
        this.gruposActivos = Array.isArray(data?.grupos || data) ? (data.grupos || data) : [];
        const currentAsesor = this.hojaControlIndForm.get('asesor')?.value;
        this.filtrarGruposPorAsesor(currentAsesor);
        this.cdr.detectChanges();
      },
      error: (err) => console.error('Error al cargar grupos:', err)
    });
  }

  // --- GUARDADO ---

  guardar() {
    if (this.hojaControlIndForm.valid) {
      Swal.fire({
        title: 'Guardando...',
        text: 'Por favor espera.',
        allowOutsideClick: false,
        didOpen: () => Swal.showLoading()
      });

      this.clienteService.crearClienteIndividual(this.hojaControlIndForm.value).subscribe({
        next: () => {
          Swal.fire({ icon: 'success', title: '¡Éxito!', text: 'Registro guardado.' });
          this.cancelar();
        },
        error: (err) => {
          Swal.fire({ icon: 'error', title: 'Error', text: err.message });
        }
      });
    } else {
      this.hojaControlIndForm.markAllAsTouched();
      Swal.fire({
        icon: 'warning',
        title: 'Campos incompletos',
        text: 'Por favor completa todos los campos obligatorios antes de guardar.',
        confirmButtonColor: '#f59e0b'
      });
    }
  }

  cancelar() {
    this.hojaControlIndForm.reset({
      ciclo: 1,
      tasaInteres: 7,
      equivalenciaMeses: 4,
      tipoPago: 'Semanal',
      noPagos: 16,
      diaPago: 'Lunes',
      horaVisita: '',
      horarioAtencion: '',
      porcentajeGarantia: 10,
      estadoGrupo: 'CC'
    });
    this.clientesFiltrados = [];
  }
}