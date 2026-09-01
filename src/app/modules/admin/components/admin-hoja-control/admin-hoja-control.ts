import { Component, OnInit, Inject, PLATFORM_ID } from '@angular/core';
import { FormBuilder, FormGroup, FormArray, ReactiveFormsModule, FormsModule, Validators } from '@angular/forms';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import Swal from 'sweetalert2';
import { GrupoService } from '../../../../core/services/grupo.service';
import { UppercaseDirective } from '../../uppercase.directive';

@Component({
  selector: 'app-admin-hoja-control',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule, UppercaseDirective],
  templateUrl: './admin-hoja-control.html',
  styleUrl: './admin-hoja-control.css',
})
export class AdminHojaControl implements OnInit {
  hojaControlForm: FormGroup;

  asesores: any[] = [];
  gruposLocales: any[] = [];
  miembrosLocales: any[] = [];
  creditosLocales: any[] = [];

  // Autocomplete bindings
  filteredGrupos: any[] = [];
  filteredMiembros: any[][] = []; // Un arreglo por cada integrante
  showGrupoSuggestions: boolean = false;
  showMiembroSuggestions: boolean[] = [];

  semanasDisponibles: { numero: number, fechaStr: string, fechaValue: string }[] = [];
  semanaSeleccionada: string = '';
  grupo: any;

  constructor(
    @Inject(PLATFORM_ID) private platformId: Object,
    private fb: FormBuilder,
    private grupoService: GrupoService
  ) {
    this.hojaControlForm = this.fb.group({
      grupoId: [''],
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
      porcentajeGarantia: [5, [Validators.min(0)]],
      integrantes: this.fb.array([])
    });
  }

  ngOnInit() {
    if (isPlatformBrowser(this.platformId)) {
      this.cargarAsesores();
      this.cargarGrupos();
      this.cargarMiembros();
      this.cargarCreditos();

    }
    this.addIntegrante(); // Añadir un integrante por defecto al inicio
    this.setupSubscriptions();
  }

  setupSubscriptions() {
    this.hojaControlForm.get('nombreGrupo')?.valueChanges.subscribe(val => {
      this.filtrarGrupos(val);
      // Si el usuario edita el nombre, asume que ya no es el grupo seleccionado
      const currentGrupoId = this.hojaControlForm.get('grupoId')?.value;
      if (currentGrupoId && !this.gruposLocales.find(g => g.nombre === val && g._id === currentGrupoId)) {
        this.hojaControlForm.get('grupoId')?.setValue('', { emitEvent: false });
        // this.hojaControlForm.get('fechaPrimerPago')?.disable();
        this.hojaControlForm.get('fechaPrimerPago')?.setValue('');
        this.semanasDisponibles = [];
      }
    });

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

    // Calcular plazoMeses automáticamente cuando cambia plazoSemanas
    this.hojaControlForm.get('plazoSemanas')?.valueChanges.subscribe((semanas) => {
      const numSemanas = Number(semanas) || 0;
      const meses = numSemanas > 0 ? Math.round(numSemanas / 4) : 0;
      this.hojaControlForm.get('plazoMeses')?.setValue(meses, { emitEvent: false });
      this.recularTodosLosPagos();
      const fecha = this.hojaControlForm.get('fechaPrimerPago')?.value;
      if (fecha) {
        this.generarSemanasOpcionales(fecha, numSemanas || 16);
      }
    });

    this.hojaControlForm.get('plazoMeses')?.valueChanges.subscribe(() => {
      this.recularTodosLosPagos();
      const fecha = this.hojaControlForm.get('fechaPrimerPago')?.value;
      const semanas = Number(this.hojaControlForm.get('plazoSemanas')?.value) || 16;
      if (fecha) {
        this.generarSemanasOpcionales(fecha, semanas);
      }
    });

    this.hojaControlForm.get('fechaPrimerPago')?.valueChanges.subscribe((fecha) => {
      const semanas = Number(this.hojaControlForm.get('plazoSemanas')?.value) || 16;
      if (fecha) {
        this.generarSemanasOpcionales(fecha, semanas);
      }
    });
  }

  recularTodosLosPagos() {
    this.integrantes.controls.forEach(ctrl => {
      this.calcularPagoPactado(ctrl as FormGroup);
    });
  }

  calcularPagoPactado(integranteForm: FormGroup) {
    const monto = Number(integranteForm.get('montoSolicitado')?.value) || 0;
    const tasa = Number(integranteForm.get('tasaInteres')?.value) || 0;
    const semanas = Number(this.hojaControlForm.get('plazoSemanas')?.value) || 16;
    const meses = Number(this.hojaControlForm.get('plazoMeses')?.value) || 0;

    if (semanas > 0) {
      // (((Monto * (Tasa/100)) * Meses) + Monto) / Semanas
      const interes = monto * (tasa / 100) * meses;
      const saldoTotal = interes + monto;
      const pagoPactado = Math.ceil(saldoTotal / semanas);

      integranteForm.get('pagoPactado')?.setValue(pagoPactado, { emitEvent: false });
      integranteForm.get('st')?.setValue(pagoPactado * semanas, { emitEvent: false });
    }
  }

  cargarAsesores(): void {
    const userRole = localStorage.getItem('userRole') || '';
    const userStr = localStorage.getItem('user');
    let userCoordinacion = '';
    if (userStr) {
      try {
        const u = JSON.parse(userStr);
        userCoordinacion = u.coordinacion || '';
      } catch (e) { }
    }

    this.grupoService.getAsesores().subscribe({
      next: (data) => {
        if (data && Array.isArray(data)) {
          if ((userRole === 'master' || userRole === 'superadmin' || userRole === 'coordinador' || userRole === 'ejecutiva') && userCoordinacion) {
            this.asesores = data.filter((a: any) => {
              const aCoord = a.coordinacion;
              const aCoordId = (aCoord && typeof aCoord === 'object') ? (aCoord._id || aCoord.id) : aCoord;
              return aCoordId && String(aCoordId) === String(userCoordinacion);
            });
          } else {
            this.asesores = data;
          }
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

  cargarGrupos(): void {
    this.grupoService.getGrupos().subscribe({
      next: (data) => {
        this.gruposLocales = data || [];
      },
      error: (err) => console.error('Error al cargar grupos', err)
    });
  }

  cargarMiembros(): void {
    this.grupoService.getMiembros().subscribe({
      next: (data) => {
        this.miembrosLocales = data || [];
      },
      error: (err) => console.error('Error al cargar miembros', err)
    });
  }

  cargarCreditos(): void {
    this.grupoService.getCreditos().subscribe({
      next: (res) => {
        this.creditosLocales = res?.creditos || res || [];
      },
      error: (err) => console.error('Error al cargar créditos', err)
    });
  }


  // --- AUTOCOMPLETADO GRUPOS ---
  filtrarGrupos(termino: string | null | undefined) {
    if (!termino || termino.trim() === '') {
      this.filteredGrupos = this.gruposLocales.slice(0, 10);
      return;
    }
    const lower = termino.toLowerCase();
    this.filteredGrupos = this.gruposLocales
      .filter(g => g.nombre.toLowerCase().includes(lower))
      .slice(0, 10);
  }

  // --- HELPERS PARA OBTENER ÚLTIMO CICLO Y TASA ---
  getCicloGrupo(grupo: any): number {
    if (!grupo) return 1;
    const miembros: any[] = Array.isArray(grupo.integrantes) ? grupo.integrantes : [];
    const miembrosIds = miembros.map(m => (typeof m === 'object' ? m._id : m));

    const creditosGrupo = this.creditosLocales.filter(c => {
      const cId = typeof c.miembro === 'object' ? c.miembro?._id : c.miembro;
      return miembrosIds.includes(cId);
    });

    if (creditosGrupo.length > 0) {
      const maxCiclo = Math.max(...creditosGrupo.map(c => c.ciclo || 1));
      return maxCiclo > 0 ? maxCiclo : 1;
    }
    return grupo.cicloActual || 1;
  }

  getTasaGrupo(grupo: any): number {
    if (!grupo) return 7;
    const miembros: any[] = Array.isArray(grupo.integrantes) ? grupo.integrantes : [];
    const miembrosIds = miembros.map(m => (typeof m === 'object' ? m._id : m));

    const creditosGrupo = this.creditosLocales.filter(c => {
      const cId = typeof c.miembro === 'object' ? c.miembro?._id : c.miembro;
      return miembrosIds.includes(cId);
    });

    if (creditosGrupo.length > 0) {
      const creditosOrdenados = [...creditosGrupo].sort((a, b) => (b.ciclo || 0) - (a.ciclo || 0));
      if (creditosOrdenados[0].tasaInteres !== undefined && creditosOrdenados[0].tasaInteres !== null) {
        return creditosOrdenados[0].tasaInteres;
      }
    }
    return grupo.tasa || 7;
  }

  seleccionarGrupo(grupo: any) {
    const ultimoCiclo = this.getCicloGrupo(grupo);
    const ultimaTasa = this.getTasaGrupo(grupo);

    // Patch de campos del grupo
    this.hojaControlForm.patchValue({
      grupoId: grupo._id,
      nombreGrupo: grupo.nombre,
      clave: grupo.clave,
      asesor: typeof grupo.asesor === 'object' ? grupo.asesor?._id : grupo.asesor,
      cicloActual: ultimoCiclo,
      tasa: ultimaTasa,
      plazoSemanas: grupo.plazoSemanas || 16,
      plazoMeses: grupo.plazoMeses || 4,
      diaVisita: grupo.diaVisita || 'Lunes',
      fechaPrimerPago: grupo.fechaPrimerPago || '',
      horaVisita: grupo.horaVisita || '',
      porcentajeGarantia: grupo.porcentajeGarantia || 5
    });

    // Resolver la fechaPrimerPago: primero del grupo, luego del crédito de algún miembro
    let fechaFuenteISO: string | null = null;
    const miembrosParaFecha: any[] = Array.isArray(grupo.integrantes) ? grupo.integrantes : [];

    if (grupo.fechaPrimerPago) {
      // Fuente 1: El grupo tiene fecha guardada
      const d = new Date(grupo.fechaPrimerPago);
      d.setMinutes(d.getMinutes() + d.getTimezoneOffset());
      fechaFuenteISO = d.toISOString().split('T')[0];
    } else if (this.creditosLocales.length > 0 && miembrosParaFecha.length > 0) {
      // Fuente 2: Buscar la fecha en el crédito de cualquier miembro del grupo
      for (const m of miembrosParaFecha) {
        const credito = this.creditosLocales.find(c => {
          const cId = typeof c.miembro === 'object' ? c.miembro?._id : c.miembro;
          return cId === (m._id || m);
        });
        if (credito?.fechaPrimerPago) {
          const d = new Date(credito.fechaPrimerPago);
          d.setMinutes(d.getMinutes() + d.getTimezoneOffset());
          fechaFuenteISO = d.toISOString().split('T')[0];
          break;
        }
      }
    }

    if (fechaFuenteISO) {
      this.hojaControlForm.get('fechaPrimerPago')?.setValue(fechaFuenteISO);
    }

    // Generar las semanas (para uso interno si se necesitan)
    this.generarSemanasOpcionales(fechaFuenteISO || grupo.fechaPrimerPago, grupo.plazoSemanas || 16);

    // --- CARGAR INTEGRANTES DEL GRUPO ---
    // Limpiar el FormArray y los arreglos de sugerencias
    this.integrantes.clear();
    this.filteredMiembros = [];
    this.showMiembroSuggestions = [];

    const miembros: any[] = Array.isArray(grupo.integrantes) ? grupo.integrantes : [];

    if (miembros.length > 0) {
      miembros.forEach(m => this.addIntegrante(m, ultimoCiclo));
    } else {
      // Si el grupo no tiene integrantes registrados, añadir una fila vacía
      this.addIntegrante();
    }

    this.showGrupoSuggestions = false;
  }

  onSemanaChange(fechaValue: string) {
    this.hojaControlForm.get('fechaPrimerPago')?.setValue(fechaValue);
  }

  generarSemanasOpcionales(fechaInicio: string, cantidad: number) {
    this.semanasDisponibles = [];
    if (!fechaInicio || !cantidad) return;

    let baseDate = new Date(fechaInicio);
    baseDate.setMinutes(baseDate.getMinutes() + baseDate.getTimezoneOffset());

    const semanas = Number(this.hojaControlForm.get('plazoSemanas')?.value) || cantidad || 16;
    const meses = Number(this.hojaControlForm.get('plazoMeses')?.value) || 4;
    const pasoDias = (semanas === 8 && meses === 4) || (meses > 0 && (semanas / meses) <= 2.5 && semanas < 16) ? 14 : 7;

    for (let i = 0; i < cantidad; i++) {
      let d = new Date(baseDate);
      d.setDate(baseDate.getDate() + (i * pasoDias));

      this.semanasDisponibles.push({
        numero: i + 1,
        fechaStr: d.toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric' }),
        fechaValue: d.toISOString().split('T')[0]
      });
    }
  }

  hideGrupoSuggestions() {
    setTimeout(() => this.showGrupoSuggestions = false, 200);
  }

  // --- AUTOCOMPLETADO MIEMBROS ---
  filtrarMiembros(termino: string | null | undefined, index: number) {
    const lower = termino ? termino.toLowerCase() : '';
    const grupoIdSeleccionado = this.hojaControlForm.get('grupoId')?.value;

    // Si hay un grupo seleccionado, filtramos preferentemente por los miembros de ese grupo.
    let miembrosDisponibles = this.miembrosLocales;
    if (grupoIdSeleccionado) {
      miembrosDisponibles = this.miembrosLocales.filter(m => {
        const mgId = typeof m.grupo === 'object' ? m.grupo?._id : m.grupo;
        return mgId === grupoIdSeleccionado;
      });
    }

    if (!termino || termino.trim() === '') {
      this.filteredMiembros[index] = miembrosDisponibles.slice(0, 15);
      return;
    }

    this.filteredMiembros[index] = miembrosDisponibles
      .filter(m => m.nombre.toLowerCase().includes(lower) || m.apellidos.toLowerCase().includes(lower))
      .slice(0, 10);
  }

  seleccionarMiembro(miembro: any, index: number) {
    const cicloReferencia = this.hojaControlForm.get('cicloActual')?.value || 1;
    let creditoActivo: any = null;
    if (miembro?._id && this.creditosLocales.length > 0) {
      const creditosMiembro = this.creditosLocales.filter(c => {
        const cMiembroId = typeof c.miembro === 'object' ? c.miembro?._id : c.miembro;
        return cMiembroId === miembro._id;
      });
      if (creditosMiembro.length > 0) {
        creditosMiembro.sort((a, b) => (b.ciclo || 0) - (a.ciclo || 0));
        creditoActivo = creditosMiembro.find(c => c.ciclo === cicloReferencia) || creditosMiembro[0];
      }
    }

    const ctrl = this.integrantes.at(index);
    ctrl.patchValue({
      miembroId: miembro._id,
      creditoId: creditoActivo?._id || null,
      nombre: miembro.nombre,
      apellidos: miembro.apellidos,
      cargo: this.mapearCargo(miembro.rol),
      tipoCredito: creditoActivo?.tipoCredito || 'CC',
      montoSolicitado: creditoActivo?.montoSolicitado ?? 0,
      tasaInteres: creditoActivo?.tasaInteres ?? this.hojaControlForm.get('tasa')?.value ?? 0
    });
    this.calcularPagoPactado(ctrl as FormGroup);
    this.showMiembroSuggestions[index] = false;
  }

  hideMiembroSuggestions(index: number) {
    setTimeout(() => this.showMiembroSuggestions[index] = false, 200);
  }

  get integrantes(): FormArray {
    return this.hojaControlForm.get('integrantes') as FormArray;
  }

  addIntegrante(miembro?: any, cicloObjetivo?: number) {
    // Obtener la tasa general actual para asignarla por defecto
    const tasaGeneralActual = this.hojaControlForm.get('tasa')?.value || 0;
    const cicloReferencia = cicloObjetivo || this.hojaControlForm.get('cicloActual')?.value || 1;

    // Buscar el crédito del miembro para ese ciclo o el más reciente
    let creditoActivo: any = null;
    if (miembro?._id && this.creditosLocales.length > 0) {
      const creditosMiembro = this.creditosLocales.filter(c => {
        const cMiembroId = typeof c.miembro === 'object' ? c.miembro?._id : c.miembro;
        return cMiembroId === miembro._id;
      });
      if (creditosMiembro.length > 0) {
        creditosMiembro.sort((a, b) => (b.ciclo || 0) - (a.ciclo || 0));
        creditoActivo = creditosMiembro.find(c => c.ciclo === cicloReferencia) || creditosMiembro[0];
      }
    }

    const integranteForm = this.fb.group({
      miembroId: [miembro?._id || ''],
      creditoId: [creditoActivo?._id || null],
      nombre: [miembro?.nombre || '', Validators.required],
      apellidos: [miembro?.apellidos || '', Validators.required],
      tipoCredito: [creditoActivo?.tipoCredito || 'CC', Validators.required],
      cargo: [this.mapearCargo(miembro?.rol), Validators.required],
      montoSolicitado: [creditoActivo?.montoSolicitado ?? 0, [Validators.required, Validators.min(0)]],
      pagoPactado: [creditoActivo?.pagoPactado ?? 0, [Validators.required, Validators.min(0)]],
      tasaInteres: [creditoActivo?.tasaInteres ?? tasaGeneralActual, [Validators.required, Validators.min(0)]],
      st: [0, [Validators.min(0)]]
    });

    // Autocomplete listeners
    const i = this.integrantes.length;
    this.filteredMiembros.push([]);
    this.showMiembroSuggestions.push(false);

    integranteForm.get('nombre')?.valueChanges.subscribe(val => {
      this.filtrarMiembros(val, i);
      const currentMiembroId = integranteForm.get('miembroId')?.value;
      if (currentMiembroId && !this.miembrosLocales.find(m => m.nombre === val && m._id === currentMiembroId)) {
        integranteForm.get('miembroId')?.setValue('', { emitEvent: false });
        integranteForm.get('creditoId')?.setValue(null, { emitEvent: false });
      }
    });

    // Suscripción para recalcular si cambia el monto o la tasa individual
    integranteForm.get('montoSolicitado')?.valueChanges.subscribe(() => {
      this.calcularPagoPactado(integranteForm);
    });
    integranteForm.get('tasaInteres')?.valueChanges.subscribe(() => {
      this.calcularPagoPactado(integranteForm);
    });
    integranteForm.get('pagoPactado')?.valueChanges.subscribe(pago => {
      const semanas = this.hojaControlForm.get('plazoSemanas')?.value || 16;
      const stCalculado = (Number(pago) || 0) * semanas;
      integranteForm.get('st')?.setValue(stCalculado, { emitEvent: false });
    });
    integranteForm.get('st')?.valueChanges.subscribe(stVal => {
      const semanas = this.hojaControlForm.get('plazoSemanas')?.value || 16;
      if (semanas > 0) {
        const pagoPactado = Math.ceil((Number(stVal) || 0) / semanas);
        integranteForm.get('pagoPactado')?.setValue(pagoPactado, { emitEvent: false });
      }
    });

    this.integrantes.push(integranteForm);
    this.calcularPagoPactado(integranteForm); // Calcular inicial
  }

  removeIntegrante(index: number) {
    this.integrantes.removeAt(index);
    this.filteredMiembros.splice(index, 1);
    this.showMiembroSuggestions.splice(index, 1);
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

  /** Mapea el rol del backend (PRESIDENTA, TESORERA, SECRETARIA, INTEGRANTE) al valor del select del HTML */
  mapearCargo(rol: string | undefined): string {
    if (!rol) return '';
    const mapa: Record<string, string> = {
      'PRESIDENTA': 'presidenta',
      'SECRETARIA': 'secretaria',
      'TESORERA': 'tesorera',
      'INTEGRANTE': 'vocal'
    };
    return mapa[rol.toUpperCase()] ?? 'vocal';
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
    this.semanasDisponibles = [];
    this.semanaSeleccionada = '';
    this.integrantes.clear();
    this.addIntegrante();
  }

  get totalMontoSolicitado(): number {
    return this.integrantes.controls.reduce((sum, ctrl) => {
      return sum + (Number(ctrl.get('montoSolicitado')?.value) || 0);
    }, 0);
  }

  get totalPagoPactado(): number {
    return this.integrantes.controls.reduce((sum, ctrl) => {
      return sum + (Number(ctrl.get('pagoPactado')?.value) || 0);
    }, 0);
  }

  get totalGarantia(): number {
    const porcentaje = Number(this.hojaControlForm.get('porcentajeGarantia')?.value) || 0;
    return this.totalMontoSolicitado * (porcentaje / 100);
  }

  get totalST(): number {
    return this.integrantes.controls.reduce((sum, ctrl) => {
      const stVal = ctrl.get('st')?.value;
      if (stVal !== null && stVal !== undefined && stVal !== '') {
        return sum + Number(stVal);
      }
      const semanas = Number(this.hojaControlForm.get('plazoSemanas')?.value) || 0;
      const pagoPactado = Number(ctrl.get('pagoPactado')?.value) || 0;
      return sum + (pagoPactado * semanas);
    }, 0);
  }
}

