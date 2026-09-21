import { Component, OnInit, Inject, PLATFORM_ID } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormBuilder, FormGroup, FormArray, ReactiveFormsModule, FormsModule, Validators } from '@angular/forms';
import { GrupoService } from '../../../../core/services/grupo.service';
import Swal from 'sweetalert2';
import { Router } from '@angular/router';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { UppercaseDirective } from '../../uppercase.directive';

@Component({
  selector: 'app-admin-actualizar-tipo-credito',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule, UppercaseDirective],
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
        const mIdStr = String(m._id || m);
        const creditosMiembro = this.creditosLocales.filter(c => {
          const cId = c.miembro ? (typeof c.miembro === 'object' ? (c.miembro._id || c.miembro) : c.miembro) : null;
          return cId && String(cId) === mIdStr;
        });
        creditoActivo = creditosMiembro.length > 0 ? creditosMiembro[creditosMiembro.length - 1] : null;
      }

      if (creditoActivo) {
        const saldoReal = this.calcularSaldoPendiente(creditoActivo);
        this.integrantes.push(this.fb.group({
          creditoId: [creditoActivo._id],
          miembroId: [m._id || m],
          nombreCompleto: [`${m.nombre} ${m.apellidos || ''}`],
          rol: [m.rol || 'INTEGRANTE'],
          montoSolicitado: [creditoActivo.montoSolicitado],
          pagoPactado: [creditoActivo.pagoPactado],
          saldoPendiente: [saldoReal],
          estado: [creditoActivo.estado],
          motivoCancelacion: [creditoActivo.motivoCancelacion || null],
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

  get isAdmin(): boolean {
    if (isPlatformBrowser(this.platformId)) {
      const role = (localStorage.getItem('userRole') || '').toLowerCase();
      return ['admin', 'master', 'superadmin'].includes(role);
    }
    return false;
  }

  calcularSaldoPendiente(credito: any): number {
    if (!credito) return 0;
    const saldoTotal = Number(credito.saldoTotal) || 0;
    const pagos = Array.isArray(credito.pagos) ? credito.pagos : [];
    const totalPagado = pagos.reduce((acc: number, p: any) => {
      return acc + (Number(p.montoPagado) || Number(p.montoSolidario) || 0);
    }, 0);
    const saldoCalculado = Math.max(0, saldoTotal - totalPagado);

    const saldoDoc = Number(credito.saldoPendiente);
    if (!isNaN(saldoDoc) && saldoDoc > 0) {
      return saldoDoc;
    }
    if (saldoCalculado > 0) {
      return saldoCalculado;
    }
    if (pagos.length === 0 && saldoTotal > 0) {
      return saldoTotal;
    }
    return 0;
  }

  puedeCancelar(ctrl: any): boolean {
    const estado = ctrl.get('estado')?.value;
    return estado !== 'Liquidado';
  }

  abrirModalCancelar(ctrl: any): void {
    const creditoId = ctrl.get('creditoId')?.value;
    const titularNombre = ctrl.get('nombreCompleto')?.value;
    const creditoObj = this.creditosLocales.find(c => String(c._id) === String(creditoId));
    const saldo = this.calcularSaldoPendiente(creditoObj) || ctrl.get('saldoPendiente')?.value || 0;

    if (!creditoId) return;

    Swal.fire({
      title: 'Cancelar Crédito por Justificación',
      html: `
        <div class="text-left text-sm space-y-3">
          <p class="text-slate-700">Vas a saldar a <strong class="text-emerald-700">$0.00</strong> el crédito de:<br><strong class="text-blue-700 text-base">${titularNombre}</strong></p>
          <div class="bg-amber-50 p-2.5 rounded-xl border border-amber-200">
            <p class="text-xs text-amber-800 font-bold uppercase tracking-wide">Saldo pendiente a liquidar:</p>
            <p class="text-lg font-black text-red-600 font-mono">$${Number(saldo).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
          </div>
          
          <div class="mt-3">
            <label class="block text-xs font-bold text-slate-700 uppercase mb-1">Motivo de Justificación *</label>
            <select id="swal-motivo-act" class="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-sm font-semibold text-slate-800 outline-none focus:border-blue-600 focus:bg-white focus:ring-2 focus:ring-blue-100">
              <option value="CANCELACION_REFILL">Cancelación por Refill</option>
              <option value="CAMBIO_CICLO">Cancelación por Cambio de Ciclo</option>
              <option value="OTRO">Otro ajuste justificado</option>
            </select>
          </div>

          <div class="mt-2">
            <label class="block text-xs font-bold text-slate-700 uppercase mb-1">Nota adicional (opcional)</label>
            <input id="swal-notas-act" type="text" placeholder="Ej. El saldo remanente se incluyó en nuevo crédito..." class="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-sm outline-none focus:border-blue-600 focus:bg-white focus:ring-2 focus:ring-blue-100">
          </div>
          
          <p class="text-[11px] text-slate-500 mt-2 italic">
            * El crédito pasará a estado Liquidado con saldo $0. El historial de pagos previos se mantendrá para auditoría.
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
        const selectEl = document.getElementById('swal-motivo-act') as HTMLSelectElement;
        const inputEl = document.getElementById('swal-notas-act') as HTMLInputElement;
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

        this.grupoService.cancelarCreditoJustificado(creditoId, { motivo, justificacion, notas }).subscribe({
          next: () => {
            ctrl.patchValue({
              saldoPendiente: 0,
              estado: 'Liquidado',
              motivoCancelacion: motivo
            });

            Swal.fire({
              icon: 'success',
              title: 'Crédito Saldado a $0',
              text: 'El crédito ha sido justificado y saldado a $0 exitosamente.',
              confirmButtonColor: '#2563eb'
            });
          },
          error: (err: any) => {
            console.error('Error al cancelar crédito justificado', err);
            Swal.fire({
              icon: 'error',
              title: 'Error',
              text: err?.error?.msg || 'No se pudo procesar la cancelación justificada.',
              confirmButtonColor: '#dc2626'
            });
          }
        });
      }
    });
  }
}
