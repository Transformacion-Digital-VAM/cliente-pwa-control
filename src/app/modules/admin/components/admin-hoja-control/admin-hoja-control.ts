import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, FormArray, ReactiveFormsModule, Validators } from '@angular/forms';
import { CommonModule } from '@angular/common';
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

  constructor(
    private fb: FormBuilder,
    private grupoService: GrupoService
  ) {
    this.hojaControlForm = this.fb.group({
      nombreGrupo: ['', Validators.required],
      clave: ['', Validators.required],
      plazo: [0, [Validators.required, Validators.min(1)]],
      tasa: [0, [Validators.required, Validators.min(0)]],
      diaVisita: ['Lunes', Validators.required],
      fechaPrimerPago: ['', Validators.required],
      horaVisita: ['', Validators.required],
      integrantes: this.fb.array([])
    });
  }

  ngOnInit() {
    this.addIntegrante(); // Añadir un integrante por defecto al inicio
  }

  get integrantes(): FormArray {
    return this.hojaControlForm.get('integrantes') as FormArray;
  }

  addIntegrante() {
    const integranteForm = this.fb.group({
      nombre: ['', Validators.required],
      apellidos: ['', Validators.required],
      cargo: ['', Validators.required],
      pagoPactado: [0, [Validators.required, Validators.min(0)]]
    });
    this.integrantes.push(integranteForm);
  }

  removeIntegrante(index: number) {
    this.integrantes.removeAt(index);
  }

  guardarCambios() {
    if (this.hojaControlForm.valid) {
      const payload = this.hojaControlForm.value;
      console.log('Enviando datos...', payload);
      this.grupoService.crearGrupo(payload).subscribe({
        next: (response) => {
          if (response?.offline) {
            alert('Se ha guardado localmente. Se sincronizará en cuanto tengas conexión a internet.');
          } else {
            alert('Grupo guardado en el servidor correctamente.');
          }
          this.cancelar(); // Limpiar el formulario
        },
        error: (err) => {
          console.error('Error al guardar el grupo', err);
          alert('Hubo un error al intentar guardar. Revisa la consola.');
        }
      });
    } else {
      this.hojaControlForm.markAllAsTouched();
      alert('Por favor, completa correctamente todos los campos obligatorios.');
      console.error('Formulario inválido:', this.hojaControlForm.value);
    }
  }

  cancelar() {
    this.hojaControlForm.reset({
      diaVisita: 'Lunes',
      plazo: 0,
      tasa: 0
    });
    this.integrantes.clear();
    this.addIntegrante();
  }
}
