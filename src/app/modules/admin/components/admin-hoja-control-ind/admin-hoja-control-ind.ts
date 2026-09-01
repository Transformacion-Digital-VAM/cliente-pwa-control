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

  // Control de UI
  showClienteSuggestions: boolean = false;

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
      semanas: [16]
    });
  }

  ngOnInit(): void {
    if (isPlatformBrowser(this.platformId)) {
      this.cargarAsesores();
      this.cargarClientes();
      this.cargarCreditos();
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
      porcentajeGarantia: 10
    });
    this.clientesFiltrados = [];
  }
}