import { Component, OnInit, Inject, PLATFORM_ID, ChangeDetectorRef } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import Swal from 'sweetalert2';
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
  asesores: any[] = [];

  constructor(
    @Inject(PLATFORM_ID) private platformId: Object,
    private fb: FormBuilder,
    private grupoService: GrupoService,
    private clienteService: ClienteService,
    private cdr: ChangeDetectorRef
  ) {
    this.hojaControlIndForm = this.fb.group({
      nombreCliente: ['', Validators.required],
      ciclo: [1, [Validators.required, Validators.min(1)]],
      asesor: ['', Validators.required],
      fechaPrimerPago: ['', Validators.required],
      montoSolicitado: ['', [Validators.required, Validators.min(0)]],
      tasaInteres: [0, [Validators.required, Validators.min(0)]],
      equivalenciaMeses: [4, [Validators.required, Validators.min(1)]],
      saldoInicial: [0], 
      garantia: [0, [Validators.required, Validators.min(0)]],
      garantiaPredial: [''],
      periodo: ['Semanal', Validators.required],
      tipoPago: ['Semanal', Validators.required],
      semanas: [16, [Validators.required, Validators.min(1)]],
      noPagos: [16, [Validators.required, Validators.min(1)]],
      diaPago: ['Lunes', Validators.required],
      pagoPactado: [0, [Validators.required, Validators.min(0)]],
      nombreGrupo: ['']
    });
  }

  ngOnInit(): void {
    if (isPlatformBrowser(this.platformId)) {
      this.cargarAsesores();
    }
    this.setupSubscriptions();
  }

  setupSubscriptions() {
    this.hojaControlIndForm.valueChanges.subscribe(() => {
      this.calcularPagoYTotal();
    });
  }

  calcularPagoYTotal() {
    const monto = this.hojaControlIndForm.get('montoSolicitado')?.value || 0;
    const tasa = this.hojaControlIndForm.get('tasaInteres')?.value || 0;
    const meses = this.hojaControlIndForm.get('equivalenciaMeses')?.value || 4;
    const noPagos = this.hojaControlIndForm.get('noPagos')?.value || 16;
    
    // Garantia liquida automatica 5%
    const garantiaCalculada = monto * 0.05;

    if (noPagos > 0) {
      const interes = monto * (tasa / 100) * meses;
      const saldoTotal = interes + monto;
      const pagoPactado = saldoTotal / noPagos;
      
      this.hojaControlIndForm.patchValue({
        pagoPactado: Number(pagoPactado.toFixed(2)),
        garantia: Number(garantiaCalculada.toFixed(2)),
        saldoInicial: saldoTotal,
        semanas: noPagos // Mantener sincronizado
      }, { emitEvent: false });
    }
  }

  cargarAsesores(): void {
    this.grupoService.getAsesores().subscribe({
      next: (data) => {
        if (data && Array.isArray(data)) {
          this.asesores = data;
        } else {
          this.asesores = [];
        }
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error('Error al cargar asesores:', err);
        this.asesores = [];
        this.cdr.detectChanges();
      }
    });
  }

  guardar() {
    if (this.hojaControlIndForm.valid) {
      const payload = this.hojaControlIndForm.value;

      Swal.fire({
        title: 'Guardando...',
        text: 'Por favor espera mientras guardamos la información.',
        allowOutsideClick: false,
        didOpen: () => {
          Swal.showLoading();
        }
      });

      this.clienteService.crearClienteIndividual(payload).subscribe({
        next: (resp) => {
          Swal.fire({
            icon: 'success',
            title: '¡Éxito!',
            text: 'Hoja de control individual y crédito guardados correctamente.',
            confirmButtonColor: '#3085d6'
          });
          this.cancelar();
        },
        error: (err) => {
          console.error("Error al crear cliente individual:", err);
          Swal.fire({
            icon: 'error',
            title: 'Error de servidor',
            text: err.message || 'Ocurrió un error al guardar el cliente y crédito.',
            confirmButtonColor: '#d33'
          });
        }
      });

    } else {
      this.hojaControlIndForm.markAllAsTouched();
      Swal.fire({
        icon: 'warning',
        title: 'Campos incompletos',
        text: 'Por favor, completa correctamente todos los campos obligatorios marcados en rojo.',
        confirmButtonColor: '#f59e0b'
      });
      console.error('Formulario inválido:', this.hojaControlIndForm.value);
    }
  }

  cancelar() {
    this.hojaControlIndForm.reset({
      ciclo: 1,
      montoSolicitado: '',
      tasaInteres: 0,
      equivalenciaMeses: 4,
      saldoInicial: 0,
      garantia: 0,
      garantiaPredial: '',
      periodo: 'Semanal',
      tipoPago: 'Semanal',
      noPagos: 16,
      semanas: 16,
      diaPago: 'Lunes',
      pagoPactado: 0,
      nombreGrupo: ''
    });
  }
}
