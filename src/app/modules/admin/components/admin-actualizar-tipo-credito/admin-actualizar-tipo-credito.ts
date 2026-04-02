import { Component, OnInit, Inject, PLATFORM_ID } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormBuilder, FormGroup, FormArray, ReactiveFormsModule, FormsModule, Validators } from '@angular/forms';
import { GrupoService } from '../../../../core/services/grupo.service';
import Swal from 'sweetalert2';
import { Router } from '@angular/router';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';

@Component({
  selector: 'app-admin-actualizar-tipo-credito',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule],
  templateUrl: './admin-actualizar-tipo-credito.html',
  styleUrl: './admin-actualizar-tipo-credito.css',
})
export class AdminActualizarTipoCredito implements OnInit {
  form: FormGroup;

  gruposLocales: any[] = [];
  miembrosLocales: any[] = [];
  creditosLocales: any[] = [];

  // Autocomplete bindings
  filteredGrupos: any[] = [];
  showGrupoSuggestions: boolean = false;

  tiposCreditoOpciones = ['CC', 'R'];

  constructor(
    @Inject(PLATFORM_ID) private platformId: Object,
    private fb: FormBuilder,
    private grupoService: GrupoService,
    private router: Router
  ) {
    this.form = this.fb.group({
      grupoId: [''],
      nombreGrupo: ['', Validators.required],
      integrantes: this.fb.array([])
    });
  }

  ngOnInit() {
    if (isPlatformBrowser(this.platformId)) {
      this.cargarGrupos();
      this.cargarMiembros();
      this.cargarCreditos();
    }
    this.setupSubscriptions();
  }

  setupSubscriptions() {
    this.form.get('nombreGrupo')?.valueChanges.subscribe(val => {
      this.filtrarGrupos(val);
      const currentGrupoId = this.form.get('grupoId')?.value;
      if (currentGrupoId && !this.gruposLocales.find(g => g.nombre === val && g._id === currentGrupoId)) {
        this.form.get('grupoId')?.setValue('', { emitEvent: false });
        this.integrantes.clear();
      }
    });
  }

  cargarGrupos(): void {
    this.grupoService.getGrupos().subscribe({
      next: (data) => this.gruposLocales = data || [],
      error: (err) => console.error('Error al cargar grupos', err)
    });
  }

  cargarMiembros(): void {
    this.grupoService.getMiembros().subscribe({
      next: (data) => this.miembrosLocales = data || [],
      error: (err) => console.error('Error al cargar miembros', err)
    });
  }

  cargarCreditos(): void {
    this.grupoService.getCreditos().subscribe({
      next: (res) => this.creditosLocales = res?.creditos || res || [],
      error: (err) => console.error('Error al cargar créditos', err)
    });
  }

  filtrarGrupos(termino: string | null | undefined) {
    this.showGrupoSuggestions = true;
    if (!termino || termino.trim() === '') {
      this.filteredGrupos = this.gruposLocales.slice(0, 10);
      return;
    }
    const lower = termino.toLowerCase();
    this.filteredGrupos = this.gruposLocales
      .filter(g => g.nombre.toLowerCase().includes(lower))
      .slice(0, 10);
  }

  hideGrupoSuggestions() {
    setTimeout(() => this.showGrupoSuggestions = false, 200);
  }

  seleccionarGrupo(grupo: any) {
    this.form.patchValue({
      grupoId: grupo._id,
      nombreGrupo: grupo.nombre,
    });
    this.showGrupoSuggestions = false;
    this.cargarIntegrantesGrupo(grupo);
  }

  get integrantes(): FormArray {
    return this.form.get('integrantes') as FormArray;
  }

  cargarIntegrantesGrupo(grupo: any) {
    this.integrantes.clear();
    const miembros: any[] = Array.isArray(grupo.integrantes) ? grupo.integrantes : [];

    if (miembros.length === 0) return;

    miembros.forEach(m => {
      // Buscar crédito activo
      let creditoActivo = null;
      if (this.creditosLocales.length > 0) {
        const creditosMiembro = this.creditosLocales.filter(c => {
          const cId = typeof c.miembro === 'object' ? c.miembro?._id : c.miembro;
          return cId === (m._id || m);
        });
        creditoActivo = creditosMiembro.length > 0 ? creditosMiembro[creditosMiembro.length - 1] : null;
      }

      if (creditoActivo) {
        this.integrantes.push(this.fb.group({
          creditoId: [creditoActivo._id],
          miembroId: [m._id || m],
          nombreCompleto: [`${m.nombre} ${m.apellidos || ''}`],
          rol: [m.rol || 'INTEGRANTE'],
          montoSolicitado: [creditoActivo.montoSolicitado],
          pagoPactado: [creditoActivo.pagoPactado],
          tipoCreditoOriginal: [creditoActivo.tipoCredito || 'CC'],
          tipoCredito: [creditoActivo.tipoCredito || 'CC']
        }));
      }
    });

    if (this.integrantes.length === 0) {
      Swal.fire('Atención', 'Este grupo no tiene créditos activos registrados para ser actualizados.', 'info');
    }
  }

  guardarCambios() {
    if (this.integrantes.length === 0) return;

    // Obtener los integrantes que realmente cambiaron su tipo de crédito
    const integrantesCambiados = this.integrantes.controls.filter(ctrl => {
      const formGroup = ctrl as FormGroup;
      return formGroup.value.tipoCredito !== formGroup.value.tipoCreditoOriginal;
    });

    if (integrantesCambiados.length === 0) {
      Swal.fire('Sin cambios', 'No has modificado ningún tipo de crédito.', 'info');
      return;
    }

    Swal.fire({
      title: 'Guardando...',
      text: 'Actualizando los tipos de crédito...',
      allowOutsideClick: false,
      didOpen: () => Swal.showLoading()
    });

    const peticiones = integrantesCambiados.map(ctrl => {
      const val = ctrl.value;
      return this.grupoService.actualizarCredito(val.creditoId, { tipoCredito: val.tipoCredito }).pipe(
        catchError(err => of({ error: true, data: err }))
      );
    });

    forkJoin(peticiones).subscribe({
      next: (results) => {
        const errores = results.filter(r => r && r.error);
        if (errores.length > 0) {
          Swal.fire('Advertencia', `Se guardaron algunos cambios, pero fallaron ${errores.length}. Revisa tu conexión.`, 'warning');
        } else {
          Swal.fire('¡Éxito!', 'Los tipos de crédito han sido actualizados.', 'success');
        }

        // Actualizar el valor original para que no vuelva a detectarse como cambiado
        integrantesCambiados.forEach(ctrl => {
          ctrl.patchValue({ tipoCreditoOriginal: ctrl.value.tipoCredito }, { emitEvent: false });
        });

        // Recargar los créditos locales para mantener sincronía
        this.cargarCreditos();
      },
      error: (err) => {
        Swal.fire('Error', 'No se pudieron guardar los cambios. Intenta más tarde.', 'error');
      }
    });
  }

  cancelar() {
    this.form.reset();
    this.integrantes.clear();
  }

  volverAInicio(): void {
    this.router.navigate(['/home-admin']);
  }
}
