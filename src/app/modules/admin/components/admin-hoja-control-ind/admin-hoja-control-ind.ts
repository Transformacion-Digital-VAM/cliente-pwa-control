import { Component, OnInit, Inject, PLATFORM_ID, ChangeDetectorRef } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import Swal from 'sweetalert2';

// Servicios
import { GrupoService } from '../../../../core/services/grupo.service';
import { ClienteService } from '../../../../core/services/cliente.service';

@Component({
  selector: 'app-admin-hoja-control-ind',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './admin-hoja-control-ind.html',
  styleUrl: './admin-hoja-control-ind.css',
})
export class AdminHojaControlInd implements OnInit {
  hojaControlIndForm: FormGroup;

  // Datos para listas y filtros
  asesores: any[] = [];
  clientesTotales: any[] = [];
  clientesFiltrados: any[] = [];

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
      garantiaPredial: [''],
      tipoPago: ['Semanal', Validators.required],
      noPagos: [16, [Validators.required, Validators.min(1)]],
      diaPago: ['Lunes', Validators.required],
      pagoPactado: [0, [Validators.required, Validators.min(0)]],
      nombreGrupo: [''],
      semanas: [16]
    });
  }

  ngOnInit(): void {
    if (isPlatformBrowser(this.platformId)) {
      this.cargarAsesores();
      this.cargarClientes();
    }
    this.setupSubscriptions();
  }

  setupSubscriptions() {
    this.hojaControlIndForm.valueChanges.subscribe(() => {
      this.calcularPagoYTotal();
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
    // 1. EXTRAER Y FORMATEAR FECHA: de "2026-03-27T23:04..." a "2026-03-27"
    let fechaLimpia = '';
    const fechaOriginal = cliente.fechaPrimerPago || cliente.createdAt; // Intenta usar la fecha de pago o la de creación

    if (fechaOriginal) {
      // Split por la 'T' para quedarnos solo con la parte YYYY-MM-DD
      fechaLimpia = fechaOriginal.split('T')[0];
    }

    // 2. PARCHEAR VALORES
    this.hojaControlIndForm.patchValue({
      idCliente: cliente._id,
      nombreCliente: `${cliente.nombre} ${cliente.apellidos || ''}`.trim(),
      asesor: cliente.asesor?._id || cliente.asesor || '',
      fechaPrimerPago: fechaLimpia, // Ahora sí se mostrará en el input date
      diaPago: cliente.diaPago || 'Lunes',
      tipoPago: cliente.tipoPago || 'Semanal',
      nombreGrupo: cliente.grupo || ''
    });

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

    const garantiaCalculada = monto * 0.10;

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
    this.grupoService.getAsesores().subscribe({
      next: (data) => {
        this.asesores = Array.isArray(data) ? data : [];
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
      error: (err) => console.error('Error al cargar miembros:', err)
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
    }
  }

  cancelar() {
    this.hojaControlIndForm.reset({
      ciclo: 1,
      tasaInteres: 7,
      equivalenciaMeses: 4,
      tipoPago: 'Semanal',
      noPagos: 16,
      diaPago: 'Lunes'
    });
    this.clientesFiltrados = [];
  }
}