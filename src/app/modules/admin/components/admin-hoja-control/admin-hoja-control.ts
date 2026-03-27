import { Component, OnInit, Inject, PLATFORM_ID } from '@angular/core';
import { FormBuilder, FormGroup, FormArray, ReactiveFormsModule, Validators } from '@angular/forms';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import Swal from 'sweetalert2';
import { GrupoService } from '../../../../core/services/grupo.service';

@Component({
  selector: 'app-admin-hoja-control',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './admin-hoja-control.html',
  styleUrl: './admin-hoja-control.css',
})
export class AdminHojaControl implements OnInit {
  hojaControlForm: FormGroup;

  asesores: any[] = [];

  constructor(
    @Inject(PLATFORM_ID) private platformId: Object,
    private fb: FormBuilder,
    private grupoService: GrupoService
  ) {
    this.hojaControlForm = this.fb.group({
      nombreGrupo: ['', Validators.required],
      clave: ['', Validators.required],
      asesor: ['', Validators.required],
      cicloActual: [1, [Validators.required, Validators.min(1)]],
      tasa: [0, [Validators.required, Validators.min(0)]],
      plazoSemanas: [16, [Validators.required, Validators.min(1)]],
      plazoMeses: [4, [Validators.required, Validators.min(1)]],
      diaVisita: ['Lunes', Validators.required],
      fechaPrimerPago: ['', Validators.required],
      horaVisita: ['', Validators.required],
      porcentajeGarantia: [5, [Validators.required, Validators.min(0)]],
      integrantes: this.fb.array([])
    });
  }

  ngOnInit() {
    if (isPlatformBrowser(this.platformId)) {
      this.cargarAsesores();
    }
    this.addIntegrante(); // Añadir un integrante por defecto al inicio
    this.setupSubscriptions();
  }

  setupSubscriptions() {
    // Escuchar cambios en la tasa general, semanas y meses para recalcular todos
    this.hojaControlForm.valueChanges.subscribe((value) => {
      // Evitar loop infinito si no es necesario (por eso verificamos en el formArray individual)
      // Pero para tasa, si cambia la tasa general, actualizamos las individuales si queremos
      // Dejaremos que individualmente se recalcule la tabla
    });

    this.hojaControlForm.get('tasa')?.valueChanges.subscribe(tasaValor => {
      // Al cambiar la tasa general, actualizamos la tasa de todos los integrantes
      this.integrantes.controls.forEach(ctrl => {
        ctrl.get('tasaInteres')?.setValue(tasaValor, { emitEvent: true });
      });
    });

    // Escuchar cambios en plazos para recalcular todos los pagos pactados
    this.hojaControlForm.get('plazoSemanas')?.valueChanges.subscribe(() => {
      this.recularTodosLosPagos();
    });
    this.hojaControlForm.get('plazoMeses')?.valueChanges.subscribe(() => {
      this.recularTodosLosPagos();
    });
  }

  recularTodosLosPagos() {
    this.integrantes.controls.forEach(ctrl => {
      this.calcularPagoPactado(ctrl as FormGroup);
    });
  }

  calcularPagoPactado(integranteForm: FormGroup) {
    const monto = integranteForm.get('montoSolicitado')?.value || 0;
    const tasa = integranteForm.get('tasaInteres')?.value || 0;
    const semanas = this.hojaControlForm.get('plazoSemanas')?.value || 16;
    const meses = this.hojaControlForm.get('plazoMeses')?.value || 4;

    if (semanas > 0) {
      // (((Monto * (Tasa/100)) * Meses) + Monto) / Semanas
      const interes = monto * (tasa / 100) * meses;
      const saldoTotal = interes + monto;
      const pagoPactado = saldoTotal / semanas;
      
      integranteForm.get('pagoPactado')?.setValue(Number(pagoPactado.toFixed(2)), { emitEvent: false });
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
      },
      error: (err) => {
        console.error('Error al cargar asesores:', err);
        this.asesores = [];
      }
    });
  }

  get integrantes(): FormArray {
    return this.hojaControlForm.get('integrantes') as FormArray;
  }

  addIntegrante() {
    // Obtener la tasa general actual para asignarla por defecto
    const tasaGeneralActual = this.hojaControlForm.get('tasa')?.value || 0;

    const integranteForm = this.fb.group({
      nombre: ['', Validators.required],
      apellidos: ['', Validators.required],
      tipoCredito: ['CC', Validators.required],
      cargo: ['', Validators.required],
      montoSolicitado: ['', [Validators.required, Validators.min(0)]],
      pagoPactado: ['', [Validators.required, Validators.min(0)]],
      tasaInteres: [tasaGeneralActual, [Validators.required, Validators.min(0)]]
    });

    // Suscripción para recalcular si cambia el monto o la tasa individual
    integranteForm.get('montoSolicitado')?.valueChanges.subscribe(() => {
      this.calcularPagoPactado(integranteForm);
    });
    integranteForm.get('tasaInteres')?.valueChanges.subscribe(() => {
      this.calcularPagoPactado(integranteForm);
    });

    this.integrantes.push(integranteForm);
    this.calcularPagoPactado(integranteForm); // Calcular inicial
  }

  removeIntegrante(index: number) {
    this.integrantes.removeAt(index);
  }

  guardarCambios() {
    if (this.hojaControlForm.valid) {
      const payload = this.hojaControlForm.value;

      Swal.fire({
        title: 'Guardando...',
        text: 'Por favor espera mientras verificamos y guardamos el grupo.',
        allowOutsideClick: false,
        didOpen: () => {
          Swal.showLoading();
        }
      });

      this.grupoService.crearGrupo(payload).subscribe({
        next: (response) => {
          if (response?.offline) {
            Swal.fire({
              icon: 'info',
              title: 'Guardado temporalmente',
              text: 'Se ha guardado localmente. Se sincronizará en cuanto tengas conexión a internet.',
              confirmButtonColor: '#3085d6'
            });
          } else {
            Swal.fire({
              icon: 'success',
              title: '¡Éxito!',
              text: 'Grupo guardado en el servidor correctamente.',
              confirmButtonColor: '#3085d6'
            });
          }
          this.cancelar(); // Limpiar el formulario
        },
        error: (err) => {
          console.error('Error al guardar el grupo', err);
          Swal.fire({
            icon: 'error',
            title: 'Oops...',
            text: 'Hubo un error al intentar guardar. Revisa la consola.',
            confirmButtonColor: '#d33'
          });
        }
      });
    } else {
      this.hojaControlForm.markAllAsTouched();
      Swal.fire({
        icon: 'warning',
        title: 'Campos incompletos',
        text: 'Por favor, completa correctamente todos los campos obligatorios.',
        confirmButtonColor: '#f59e0b'
      });
      console.error('Formulario inválido:', this.hojaControlForm.value);
    }
  }

  cancelar() {
    this.hojaControlForm.reset({
      diaVisita: 'Lunes',
      cicloActual: 1,
      tasa: 0,
      plazoSemanas: 16,
      plazoMeses: 4,
      porcentajeGarantia: 5
    });
    this.integrantes.clear();
    this.addIntegrante();
  }
}
