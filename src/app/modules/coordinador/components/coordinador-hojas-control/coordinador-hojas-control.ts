import { Component, OnInit, ChangeDetectorRef, Inject, PLATFORM_ID } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import Swal from 'sweetalert2';
import { GrupoService } from '../../../../core/services/grupo.service';
import { ClienteService } from '../../../../core/services/cliente.service';
import { AuthService } from '../../../../core/services/auth.service';
import { environment } from '../../../../../environments/environment';

@Component({
  selector: 'app-coordinador-hojas-control',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './coordinador-hojas-control.html',
  styleUrl: './coordinador-hojas-control.css'
})
export class CoordinadorHojasControl implements OnInit {
  // Estado general
  isLoading: boolean = true;
  activeTab: 'grupos' | 'individuales' = 'grupos';

  // Datos del coordinador
  currentUserId: string = '';
  currentUsername: string = '';
  userRole: string = 'coordinador';
  coordinadorName: string = 'Coordinador';
  coordinacionId: string = '';
  coordinacionNombre: string = 'Mi Coordinación';

  // Listas base
  grupos: any[] = [];
  clientes: any[] = [];
  asesoresList: any[] = [];
  asesoresSoloList: any[] = [];
  ejecutivasList: any[] = [];

  // Filtros
  searchTerm: string = '';
  filtroOrigen: 'todos' | 'asesores' | 'ejecutiva' = 'todos';
  filtroAsesorId: string = 'todos';
  filtroEstado: string = 'todos';

  // Paginación (máximo 7 por página)
  currentPage: number = 1;
  readonly itemsPerPage: number = 7;

  // Acordeón para inspeccionar detalles en solo lectura
  expandedItems: { [id: string]: boolean } = {};

  // Modal Vista Previa (Solo Lectura)
  previewUrl: string | null = null;
  previewSafeUrl: SafeResourceUrl | null = null;
  previewGrupoNombre: string = '';

  // Mapeos rápidos para créditos y usuarios
  private creditoMiembroMap = new Map<string, any>();
  private creditoClienteMap = new Map<string, any>();
  private usuariosMap = new Map<string, any>();

  constructor(
    @Inject(PLATFORM_ID) private platformId: Object,
    private grupoService: GrupoService,
    private clienteService: ClienteService,
    private authService: AuthService,
    private router: Router,
    private cdr: ChangeDetectorRef,
    private sanitizer: DomSanitizer
  ) { }

  ngOnInit(): void {
    if (isPlatformBrowser(this.platformId)) {
      this.cargarDatosUsuario();
      this.cargarDatos(true);
    }
  }

  private extraerId(val: any): string {
    if (!val) return '';
    if (typeof val === 'object') {
      return String(val._id || val.id || val.$oid || '');
    }
    return String(val);
  }

  private normalizarRol(role: any): string {
    const r = String(role || '').trim().toLowerCase();
    if (['coordinador', 'acoordinador', 'cop', 'coordinacion'].includes(r)) {
      return 'coordinador';
    }
    if (['master', 'ejecutiva'].includes(r)) {
      return 'master';
    }
    return r;
  }

  private cargarDatosUsuario(): void {
    const userStr = localStorage.getItem('user');
    if (userStr) {
      try {
        const userObj = JSON.parse(userStr);
        this.currentUserId = this.extraerId(userObj._id || userObj.id);
        this.currentUsername = String(userObj.username || '').trim();
        this.userRole = this.normalizarRol(userObj.role || 'coordinador');
        this.coordinadorName = userObj.nombre || userObj.username || 'Coordinador';
        this.coordinacionId = this.extraerId(userObj.coordinacion);
        if (userObj.coordinacion && typeof userObj.coordinacion === 'object' && userObj.coordinacion.nombre) {
          this.coordinacionNombre = userObj.coordinacion.nombre;
        }
      } catch (e) {
        console.error('Error parseando datos de usuario:', e);
      }
    }
  }

  cargarDatos(forceRefresh = false): void {
    this.isLoading = true;
    this.cdr.markForCheck();

    if (forceRefresh) {
      this.grupoService.limpiarCache();
      this.clienteService.clearCache();
    }

    forkJoin({
      grupos: this.grupoService.getGrupos(forceRefresh).pipe(catchError(() => of([]))),
      asesores: this.grupoService.getAsesores(forceRefresh).pipe(catchError(() => of([]))),
      clientes: this.clienteService.getClientes({ conCredito: true }, forceRefresh).pipe(catchError(() => of([]))),
      coordinaciones: this.grupoService.getCoordinaciones(forceRefresh).pipe(catchError(() => of([]))),
      creditosRes: this.grupoService.getCreditos({}, forceRefresh).pipe(catchError(() => of([]))),
      miembrosRes: this.grupoService.getMiembros(forceRefresh).pipe(catchError(() => of([])))
    }).subscribe({
      next: (res: any) => {
        const allCoordinaciones = res.coordinaciones || [];
        const allAsesores = res.asesores || [];
        const allGrupos = res.grupos || [];
        const allClientes = res.clientes || [];
        const allCreditos = res.creditosRes?.creditos || res.creditosRes || [];

        // 1. Resolver coordinacionId si no venía en localStorage (ej. usuario al que se le cambió el rol en BD)
        if (!this.coordinacionId) {
          const meInAsesores = allAsesores.find((a: any) => {
            const aId = this.extraerId(a);
            return (this.currentUserId && aId === this.currentUserId) ||
              (this.currentUsername && String(a.username || '').toLowerCase() === this.currentUsername.toLowerCase());
          });
          if (meInAsesores) {
            const coordFromMe = this.extraerId(meInAsesores.coordinacion);
            if (coordFromMe) {
              this.coordinacionId = coordFromMe;
            }
          }
        }

        if (!this.coordinacionId && this.coordinadorName) {
          const matchedCoord = allCoordinaciones.find((c: any) =>
            c.coordinador && (
              c.coordinador.toLowerCase().includes(this.coordinadorName.toLowerCase()) ||
              this.coordinadorName.toLowerCase().includes(c.coordinador.toLowerCase())
            )
          );
          if (matchedCoord) {
            this.coordinacionId = String(matchedCoord._id);
            this.coordinacionNombre = matchedCoord.nombre;
          }
        }

        if (!this.coordinacionId && allGrupos.length > 0) {
          for (const g of allGrupos) {
            const gCoord = this.extraerId(g.coordinacion) || this.extraerId(g.asesor?.coordinacion);
            if (gCoord) {
              this.coordinacionId = gCoord;
              break;
            }
          }
        }

        if (this.coordinacionId) {
          const coordObj = allCoordinaciones.find((c: any) => String(c._id) === String(this.coordinacionId));
          if (coordObj && coordObj.nombre) {
            this.coordinacionNombre = coordObj.nombre;
          }
        }

        // 2. Identificar hojas (grupos y clientes) que pertenecen a la coordinación
        // Si el usuario tiene rol 'coordinador', el backend ya filtró allGrupos y allClientes por su coordinación.
        let usuariosCoordinacion: any[] = [];
        if (this.coordinacionId) {
          usuariosCoordinacion = allAsesores.filter((a: any) => {
            const aCoord = this.extraerId(a.coordinacion);
            return aCoord && aCoord === String(this.coordinacionId);
          });
        } else {
          usuariosCoordinacion = [...allAsesores];
        }

        this.usuariosMap.clear();
        for (const u of usuariosCoordinacion) {
          const uid = this.extraerId(u);
          if (uid) this.usuariosMap.set(uid, u);
        }

        // Registrar también cualquier asesor/master poblado en los grupos o clientes recibidos
        for (const item of [...allGrupos, ...allClientes]) {
          if (item?.asesor && typeof item.asesor === 'object') {
            const aId = this.extraerId(item.asesor);
            const itemCoord = this.extraerId(item.coordinacion) || this.extraerId(item.asesor.coordinacion);
            const perteneceACoord = this.userRole === 'coordinador' || !this.coordinacionId || !itemCoord || itemCoord === String(this.coordinacionId);
            if (aId && perteneceACoord) {
              if (!this.usuariosMap.has(aId)) {
                this.usuariosMap.set(aId, item.asesor);
              } else {
                const existing = this.usuariosMap.get(aId);
                if (!existing.role && item.asesor.role) {
                  existing.role = item.asesor.role;
                }
              }
            }
          }
        }

        // Contar qué usuarios tienen hojas asignadas para saber si un coordinador tiene hojas propias
        const idsConHojas = new Set<string>();
        for (const item of [...allGrupos, ...allClientes]) {
          const aId = this.extraerId(item?.asesor);
          if (aId) idsConHojas.add(aId);
        }

        const todosUsuariosCoord = Array.from(this.usuariosMap.values());
        this.ejecutivasList = todosUsuariosCoord.filter((u: any) => this.normalizarRol(u.role) === 'master');
        this.asesoresSoloList = todosUsuariosCoord.filter((u: any) => {
          const rolNorm = this.normalizarRol(u.role);
          if (rolNorm === 'master') return false;
          if (rolNorm === 'coordinador') {
            return idsConHojas.has(this.extraerId(u));
          }
          return true;
        });
        this.asesoresList = [...this.ejecutivasList, ...this.asesoresSoloList];

        const asesorIdsEnCoord = new Set(this.asesoresList.map((a: any) => this.extraerId(a)));

        // 3. Crear mapa de créditos
        this.creditoMiembroMap.clear();
        this.creditoClienteMap.clear();

        for (const c of allCreditos) {
          if (c.miembro) {
            const mId = this.extraerId(c.miembro);
            if (!this.creditoMiembroMap.has(mId) || c.estado === 'Activo') {
              this.creditoMiembroMap.set(mId, c);
            }
          }
          if (c.cliente) {
            const clId = this.extraerId(c.cliente);
            if (!this.creditoClienteMap.has(clId) || c.estado === 'Activo') {
              this.creditoClienteMap.set(clId, c);
            }
          }
        }

        // 4. Filtrar y asignar créditos a integrantes de grupos (asesores y ejecutiva/master)
        let gruposAProcesar = allGrupos;
        if (this.userRole !== 'coordinador' && this.coordinacionId) {
          gruposAProcesar = allGrupos.filter((g: any) => {
            const gCoord = this.extraerId(g.coordinacion) || this.extraerId(g.asesor?.coordinacion);
            if (gCoord && gCoord === String(this.coordinacionId)) return true;
            const aId = this.extraerId(g.asesor);
            return aId && asesorIdsEnCoord.has(aId);
          });
        }

        this.grupos = gruposAProcesar.map((g: any) => {
          const integrantesConCredito = (g.integrantes || []).map((m: any) => {
            const mId = this.extraerId(m);
            const cred = this.creditoMiembroMap.get(mId) || null;
            return {
              ...m,
              credito: cred
            };
          });
          return {
            ...g,
            esEjecutiva: this.esHojaDeEjecutiva(g),
            integrantes: integrantesConCredito
          };
        });

        // 5. Filtrar y asignar créditos a clientes individuales (asesores y ejecutiva/master)
        let clientesAProcesar = allClientes;
        if (this.userRole !== 'coordinador' && this.coordinacionId) {
          clientesAProcesar = allClientes.filter((c: any) => {
            const cCoord = this.extraerId(c.coordinacion) || this.extraerId(c.asesor?.coordinacion);
            if (cCoord && cCoord === String(this.coordinacionId)) return true;
            const aId = this.extraerId(c.asesor);
            return aId && asesorIdsEnCoord.has(aId);
          });
        }

        this.clientes = clientesAProcesar.map((c: any) => {
          const clId = String(c._id);
          const cred = c.credito || c.creditoActivo || this.creditoClienteMap.get(clId) || null;
          return {
            ...c,
            esEjecutiva: this.esHojaDeEjecutiva(c),
            credito: cred
          };
        });

        this.isLoading = false;
        this.cdr.markForCheck();
      },
      error: (err) => {
        console.error('Error al cargar datos del módulo coordinador:', err);
        this.isLoading = false;
        this.cdr.markForCheck();
      }
    });
  }

  // --- IDENTIFICACIÓN DE EJECUTIVA (ROL MASTER) ---

  esUsuarioEjecutiva(usuario: any): boolean {
    if (!usuario) return false;
    if (this.normalizarRol(usuario.role) === 'master') return true;
    const id = this.extraerId(usuario);
    return this.ejecutivasList.some(e => this.extraerId(e) === id);
  }

  esHojaDeEjecutiva(item: any): boolean {
    if (!item?.asesor) return false;
    if (typeof item.asesor === 'object' && this.normalizarRol(item.asesor.role) === 'master') {
      return true;
    }
    const aId = this.extraerId(item.asesor);
    const userEnMapa = this.usuariosMap.get(aId);
    if (userEnMapa && this.normalizarRol(userEnMapa.role) === 'master') {
      return true;
    }
    return this.ejecutivasList.some(e => this.extraerId(e) === aId);
  }

  get nombreEjecutivaCoordinacion(): string {
    if (this.ejecutivasList.length === 0) return 'Sin Ejecutiva asignada';
    return this.ejecutivasList.map(e => e.nombre || e.username).join(', ');
  }

  get totalHojasEjecutiva(): number {
    const gCount = this.grupos.filter(g => g.esEjecutiva).length;
    const cCount = this.clientes.filter(c => c.esEjecutiva).length;
    return gCount + cCount;
  }

  get gruposEjecutivaCount(): number {
    return this.grupos.filter(g => g.esEjecutiva).length;
  }

  get clientesEjecutivaCount(): number {
    return this.clientes.filter(c => c.esEjecutiva).length;
  }

  contarHojasPorUsuario(userId: string): number {
    const idStr = String(userId);
    const lista = this.activeTab === 'grupos' ? this.grupos : this.clientes;
    return lista.filter(item => this.extraerId(item.asesor) === idStr).length;
  }

  // --- FILTROS COMPUTADOS ---

  get usuariosFiltroDisponibles(): any[] {
    if (this.filtroOrigen === 'ejecutiva') {
      return this.ejecutivasList;
    }
    if (this.filtroOrigen === 'asesores') {
      return this.asesoresSoloList;
    }
    return this.asesoresList;
  }

  get gruposFiltrados(): any[] {
    let result = this.grupos;

    // Filtro por Origen (Todos / Asesores / Ejecutiva)
    if (this.filtroOrigen === 'ejecutiva') {
      result = result.filter(g => g.esEjecutiva);
    } else if (this.filtroOrigen === 'asesores') {
      result = result.filter(g => !g.esEjecutiva);
    }

    // Filtro por Asesor / Ejecutiva específico
    if (this.filtroAsesorId && this.filtroAsesorId !== 'todos') {
      result = result.filter(g => {
        const aId = this.extraerId(g.asesor);
        return aId && aId === String(this.filtroAsesorId);
      });
    }

    // Filtro por Estado
    if (this.filtroEstado && this.filtroEstado !== 'todos') {
      result = result.filter(g => g.estadoGrupo === this.filtroEstado);
    }

    // Búsqueda por texto (nombre, clave, asesor/ejecutiva)
    if (this.searchTerm && this.searchTerm.trim()) {
      const term = this.searchTerm.toLowerCase().trim();
      result = result.filter(g => {
        const nombre = (g.nombre || '').toLowerCase();
        const clave = (g.clave || '').toLowerCase();
        const asesorNombre = this.obtenerNombreAsesor(g).toLowerCase();
        return nombre.includes(term) || clave.includes(term) || asesorNombre.includes(term);
      });
    }

    return result;
  }

  get clientesFiltrados(): any[] {
    let result = this.clientes;

    // Filtro por Origen (Todos / Asesores / Ejecutiva)
    if (this.filtroOrigen === 'ejecutiva') {
      result = result.filter(c => c.esEjecutiva);
    } else if (this.filtroOrigen === 'asesores') {
      result = result.filter(c => !c.esEjecutiva);
    }

    // Filtro por Asesor / Ejecutiva específico
    if (this.filtroAsesorId && this.filtroAsesorId !== 'todos') {
      result = result.filter(c => {
        const aId = this.extraerId(c.asesor);
        return aId && aId === String(this.filtroAsesorId);
      });
    }

    // Búsqueda por texto (nombre, clave, asesor/ejecutiva)
    if (this.searchTerm && this.searchTerm.trim()) {
      const term = this.searchTerm.toLowerCase().trim();
      result = result.filter(c => {
        const nombre = (c.nombre || '').toLowerCase();
        const clave = (c.clave || '').toLowerCase();
        const asesorNombre = this.obtenerNombreAsesor(c).toLowerCase();
        return nombre.includes(term) || clave.includes(term) || asesorNombre.includes(term);
      });
    }

    return result;
  }

  // --- PAGINACIÓN (MÁX 7 POR PÁGINA) ---

  get totalRegistrosActivos(): number {
    return this.activeTab === 'grupos' ? this.gruposFiltrados.length : this.clientesFiltrados.length;
  }

  get totalPages(): number {
    return Math.max(1, Math.ceil(this.totalRegistrosActivos / this.itemsPerPage));
  }

  get paginaActualSegura(): number {
    return Math.min(Math.max(1, this.currentPage), this.totalPages);
  }

  get gruposPaginados(): any[] {
    const start = (this.paginaActualSegura - 1) * this.itemsPerPage;
    return this.gruposFiltrados.slice(start, start + this.itemsPerPage);
  }

  get clientesPaginados(): any[] {
    const start = (this.paginaActualSegura - 1) * this.itemsPerPage;
    return this.clientesFiltrados.slice(start, start + this.itemsPerPage);
  }

  get rangoInicioPagina(): number {
    if (this.totalRegistrosActivos === 0) return 0;
    return (this.paginaActualSegura - 1) * this.itemsPerPage + 1;
  }

  get rangoFinPagina(): number {
    return Math.min(this.paginaActualSegura * this.itemsPerPage, this.totalRegistrosActivos);
  }

  get paginasVisibles(): number[] {
    const total = this.totalPages;
    const actual = this.paginaActualSegura;
    const paginas: number[] = [];

    if (total <= 7) {
      for (let i = 1; i <= total; i++) paginas.push(i);
      return paginas;
    }

    let inicio = Math.max(1, actual - 2);
    let fin = Math.min(total, inicio + 4);
    if (fin - inicio < 4) {
      inicio = Math.max(1, fin - 4);
    }
    for (let i = inicio; i <= fin; i++) {
      paginas.push(i);
    }
    return paginas;
  }

  cambiarPagina(page: number): void {
    const total = this.totalPages;
    if (page >= 1 && page <= total) {
      this.currentPage = page;
      this.cdr.markForCheck();
    }
  }

  onSearchChange(): void {
    this.currentPage = 1;
  }

  setTab(tab: 'grupos' | 'individuales'): void {
    this.activeTab = tab;
    this.currentPage = 1;
  }

  setFiltroOrigen(origen: 'todos' | 'asesores' | 'ejecutiva'): void {
    this.filtroOrigen = origen;
    this.filtroAsesorId = 'todos';
    this.currentPage = 1;
    if (origen === 'ejecutiva') {
      if (this.activeTab === 'grupos' && this.gruposEjecutivaCount === 0 && this.clientesEjecutivaCount > 0) {
        this.activeTab = 'individuales';
      } else if (this.activeTab === 'individuales' && this.clientesEjecutivaCount === 0 && this.gruposEjecutivaCount > 0) {
        this.activeTab = 'grupos';
      }
    }
  }

  setFiltroAsesor(asesorId: string): void {
    this.filtroAsesorId = asesorId;
    this.currentPage = 1;
  }

  limpiarFiltros(): void {
    this.searchTerm = '';
    this.filtroOrigen = 'todos';
    this.filtroAsesorId = 'todos';
    this.filtroEstado = 'todos';
    this.currentPage = 1;
  }

  toggleAccordion(id: string, event?: Event): void {
    if (event) event.stopPropagation();
    this.expandedItems[id] = !this.expandedItems[id];
  }

  irAAsesorHome(): void {
    this.router.navigate(['/home-asesor']);
  }

  async logout(): Promise<void> {
    await this.authService.logout();
  }

  toggleValidarGrupo(grupo: any, event: Event): void {
    event.stopPropagation();
    const nuevoEstado = !grupo.validada;
    this.grupoService.validarGrupo(grupo._id, nuevoEstado).subscribe({
      next: (res: any) => {
        grupo.validada = res?.validada ?? nuevoEstado;
        grupo.validadaPor = res?.validadaPor ?? (nuevoEstado ? this.coordinadorName : null);
        grupo.fechaValidacion = res?.fechaValidacion ?? (nuevoEstado ? new Date() : null);
        this.cdr.markForCheck();
      },
      error: (err: any) => {
        console.error('Error al validar grupo:', err);
        Swal.fire('Error', 'No se pudo actualizar la validación de la hoja.', 'error');
      }
    });
  }

  toggleValidarCliente(cliente: any, event: Event): void {
    event.stopPropagation();
    const nuevoEstado = !cliente.validada;
    this.clienteService.validarCliente(cliente._id, nuevoEstado).subscribe({
      next: (res: any) => {
        cliente.validada = res?.validada ?? nuevoEstado;
        cliente.validadaPor = res?.validadaPor ?? (nuevoEstado ? this.coordinadorName : null);
        cliente.fechaValidacion = res?.fechaValidacion ?? (nuevoEstado ? new Date() : null);
        this.cdr.markForCheck();
      },
      error: (err: any) => {
        console.error('Error al validar cliente:', err);
        Swal.fire('Error', 'No se pudo actualizar la validación de la hoja.', 'error');
      }
    });
  }

  abrirHojaControlGrupo(grupo: any, event?: Event): void {
    if (event) event.stopPropagation();
    this.router.navigate(['/hoja-control-asesor', grupo._id]);
  }

  abrirHojaControlCliente(cliente: any, event?: Event): void {
    if (event) event.stopPropagation();
    this.router.navigate(['/hoja-control-individual', cliente._id]);
  }

  // --- VISTA PREVIA HOJAS DE CONTROL PDF ---

  async vistaPreviaGrupo(grupo: any, event: Event): Promise<void> {
    event.stopPropagation();

    const ciclo = this.getCicloActualGrupo(grupo);
    const totalSemanas = this.getSemanasGrupo(grupo, ciclo);
    const opciones = this.generarOpcionesSemanas(totalSemanas);
    const optionsHtml = Object.entries(opciones)
      .map(([val, label]) => `<option value="${val}">${label}</option>`)
      .join('');

    const { value: formValues, isConfirmed } = await Swal.fire({
      title: 'Vista Previa Grupal',
      html: `
        <div style="text-align: left; padding-top: 8px;">
          <p style="font-size: 13px; color: #64748b; margin-bottom: 14px;">
            Grupo: <strong style="color: #1e293b;">${grupo.nombre || 'Sin Nombre'}</strong> (${grupo.clave || 'S/C'})
          </p>
          <div style="margin-bottom: 16px;">
            <label style="display: block; font-size: 11px; font-weight: 700; color: #475569; text-transform: uppercase; margin-bottom: 4px;">Tipo de Hoja</label>
            <select id="swal-tipo-hoja" style="width: 100%; padding: 8px 12px; border: 1px solid #cbd5e1; border-radius: 8px; font-size: 14px; background-color: #fff;">
              <option value="llena">Hoja Llena </option>
              <option value="vacia">Hoja Vacía </option>
            </select>
          </div>
          <div>
            <label style="display: block; font-size: 11px; font-weight: 700; color: #475569; text-transform: uppercase; margin-bottom: 4px;">Rango de Semanas (${totalSemanas} semanas)</label>
            <select id="swal-rango-semanas" style="width: 100%; padding: 8px 12px; border: 1px solid #cbd5e1; border-radius: 8px; font-size: 14px; background-color: #fff;">
              ${optionsHtml}
            </select>
          </div>
        </div>
      `,
      focusConfirm: false,
      showCancelButton: true,
      confirmButtonText: 'Abrir Vista Previa',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#7c3aed',
      preConfirm: () => {
        const tipoElem = document.getElementById('swal-tipo-hoja') as HTMLSelectElement;
        const rangoElem = document.getElementById('swal-rango-semanas') as HTMLSelectElement;
        return {
          tipo: tipoElem ? tipoElem.value : 'llena',
          rango: rangoElem ? rangoElem.value : 'completa'
        };
      }
    });

    if (isConfirmed && formValues) {
      let url = `${environment.apiUrl}/creditos/hoja-control/${grupo._id}/${ciclo}?preview=true`;
      if (formValues.tipo === 'llena') {
        url += '&llena=true';
      }
      if (formValues.rango !== 'completa') {
        const { inicio, fin } = this.obtenerRangoSemanas(formValues.rango, totalSemanas);
        url += `&semanaInicio=${inicio}&semanaFin=${fin}`;
      }
      this.abrirModalPreview(url, `${grupo.nombre || 'Grupo'} (Ciclo ${ciclo})`);
    }
  }

  async vistaPreviaIndividual(cliente: any, event: Event): Promise<void> {
    event.stopPropagation();

    const ciclo = this.getCicloActualCliente(cliente);
    const totalSemanas = this.getSemanasCliente(cliente);
    const opciones = this.generarOpcionesSemanas(totalSemanas);
    const optionsHtml = Object.entries(opciones)
      .map(([val, label]) => `<option value="${val}">${label}</option>`)
      .join('');

    const { value: formValues, isConfirmed } = await Swal.fire({
      title: 'Vista Previa Individual',
      html: `
        <div style="text-align: left; padding-top: 8px;">
          <p style="font-size: 13px; color: #64748b; margin-bottom: 14px;">
            Cliente: <strong style="color: #1e293b;">${cliente.nombre || 'Sin Nombre'}</strong>
          </p>
          <div style="margin-bottom: 16px;">
            <label style="display: block; font-size: 11px; font-weight: 700; color: #475569; text-transform: uppercase; margin-bottom: 4px;">Tipo de Hoja</label>
            <select id="swal-tipo-hoja-ind" style="width: 100%; padding: 8px 12px; border: 1px solid #cbd5e1; border-radius: 8px; font-size: 14px; background-color: #fff;">
              <option value="llena">Hoja Llena </option>
              <option value="vacia">Hoja Vacía </option>
            </select>
          </div>
          <div>
            <label style="display: block; font-size: 11px; font-weight: 700; color: #475569; text-transform: uppercase; margin-bottom: 4px;">Rango de Semanas (${totalSemanas} semanas)</label>
            <select id="swal-rango-semanas-ind" style="width: 100%; padding: 8px 12px; border: 1px solid #cbd5e1; border-radius: 8px; font-size: 14px; background-color: #fff;">
              ${optionsHtml}
            </select>
          </div>
        </div>
      `,
      focusConfirm: false,
      showCancelButton: true,
      confirmButtonText: 'Abrir Vista Previa',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#7c3aed',
      preConfirm: () => {
        const tipoElem = document.getElementById('swal-tipo-hoja-ind') as HTMLSelectElement;
        const rangoElem = document.getElementById('swal-rango-semanas-ind') as HTMLSelectElement;
        return {
          tipo: tipoElem ? tipoElem.value : 'llena',
          rango: rangoElem ? rangoElem.value : 'completa'
        };
      }
    });

    if (isConfirmed && formValues) {
      const estadoGrupo = cliente.estadoGrupo ? `&estadoGrupo=${cliente.estadoGrupo}` : '';
      let url = `${environment.apiUrl}/creditos/hoja-control-individual/${cliente._id}/${ciclo}?preview=true${estadoGrupo}`;
      if (formValues.tipo === 'llena') {
        url += '&llena=true';
      }
      if (formValues.rango !== 'completa') {
        const { inicio, fin } = this.obtenerRangoSemanas(formValues.rango, totalSemanas);
        url += `&semanaInicio=${inicio}&semanaFin=${fin}`;
      }
      this.abrirModalPreview(url, `${cliente.nombre || 'Cliente'} (Ciclo ${ciclo})`);
    }
  }

  abrirModalPreview(url: string, nombre: string): void {
    this.previewGrupoNombre = nombre;
    this.previewUrl = url;
    this.previewSafeUrl = this.sanitizer.bypassSecurityTrustResourceUrl(`${url}#toolbar=0`);
    this.cdr.markForCheck();
  }

  cerrarPreview(): void {
    this.previewUrl = null;
    this.previewSafeUrl = null;
    this.previewGrupoNombre = '';
    this.cdr.markForCheck();
  }

  abrirEnNuevaPestana(): void {
    if (this.previewUrl) {
      window.open(`${this.previewUrl}#toolbar=0`, '_blank');
    }
  }

  // --- MÉTODOS DE APOYO DE CICLOS Y SEMANAS ---

  getCicloActualGrupo(grupo: any): number {
    if (!grupo) return 1;
    let maxCicloActivo = 0;
    let maxCicloTotal = Number(grupo.cicloActual) || 0;
    if (grupo.integrantes && Array.isArray(grupo.integrantes)) {
      for (const m of grupo.integrantes) {
        const cred = m.credito || this.creditoMiembroMap?.get(this.extraerId(m));
        if (cred) {
          const cCiclo = Number(cred.ciclo) || 0;
          if (cCiclo > 0) {
            if (cred.estado === 'Activo' && cCiclo > maxCicloActivo) {
              maxCicloActivo = cCiclo;
            }
            if (cCiclo > maxCicloTotal) {
              maxCicloTotal = cCiclo;
            }
          }
        }
        if (m.ciclo) {
          const mCiclo = Number(m.ciclo) || 0;
          if (mCiclo > maxCicloTotal) maxCicloTotal = mCiclo;
        }
      }
    }
    return maxCicloActivo > 0 ? maxCicloActivo : (maxCicloTotal > 0 ? maxCicloTotal : 1);
  }

  getSemanasGrupo(grupo: any, ciclo?: number): number {
    if (!grupo) return 16;
    const cicloABuscar = ciclo || this.getCicloActualGrupo(grupo);
    const semanasEncontradas: number[] = [];

    if (grupo.integrantes && Array.isArray(grupo.integrantes)) {
      for (const m of grupo.integrantes) {
        const cred = m.credito;
        if (cred) {
          const cCiclo = Number(cred.ciclo) || 0;
          if (cCiclo === cicloABuscar || cred.estado === 'Activo') {
            const sem = Number(cred.semanas) || (cred.tipoCredito === '8S' ? 8 : 0);
            if (sem > 0) semanasEncontradas.push(sem);
          }
        }
      }
    }

    if (semanasEncontradas.length > 0) {
      return Math.max(...semanasEncontradas);
    }
    if (grupo.plazoSemanas && Number(grupo.plazoSemanas) > 0) {
      return Number(grupo.plazoSemanas);
    }
    return 16;
  }

  getCicloActualCliente(cliente: any): number {
    if (!cliente) return 1;
    const cred = cliente.credito;
    if (cred && cred.ciclo) {
      return Number(cred.ciclo) || 1;
    }
    return 1;
  }

  getSemanasCliente(cliente: any): number {
    if (!cliente) return 16;
    const cred = cliente.credito;
    if (cred && cred.semanas && Number(cred.semanas) > 0) {
      return Number(cred.semanas);
    }
    return 16;
  }

  generarOpcionesSemanas(totalSemanas: number): { [key: string]: string } {
    const opciones: { [key: string]: string } = {};

    if (totalSemanas <= 8) {
      opciones['completa'] = `Completa (${totalSemanas} semanas)`;
      opciones['1'] = `Semana 1 a ${totalSemanas}`;
      return opciones;
    }

    if (totalSemanas <= 16) {
      opciones['completa'] = `Completa (${totalSemanas} semanas)`;
      for (let inicio = 1; inicio <= totalSemanas; inicio += 8) {
        const fin = Math.min(inicio + 7, totalSemanas);
        opciones[`${inicio}-${fin}`] = `Semana ${inicio} a ${fin}`;
      }
      return opciones;
    }

    const mitad = Math.ceil(totalSemanas / 2);
    opciones['completa'] = `Completa (${totalSemanas} semanas en 2 hojas)`;
    opciones[`1-${mitad}`] = `Parte 1: Semana 1 a ${mitad}`;
    opciones[`${mitad + 1}-${totalSemanas}`] = `Parte 2: Semana ${mitad + 1} a ${totalSemanas}`;

    for (let inicio = 1; inicio <= totalSemanas; inicio += 8) {
      const fin = Math.min(inicio + 7, totalSemanas);
      opciones[`${inicio}-${fin}`] = `Bloque: Semana ${inicio} a ${fin}`;
    }

    return opciones;
  }

  obtenerRangoSemanas(opcion: string, totalSemanas: number): { inicio: number; fin: number } {
    if (opcion.includes('-')) {
      const partes = opcion.split('-');
      return {
        inicio: parseInt(partes[0], 10) || 1,
        fin: parseInt(partes[1], 10) || totalSemanas
      };
    }
    const inicio = parseInt(opcion, 10) || 1;
    return {
      inicio,
      fin: Math.min(inicio + 7, totalSemanas)
    };
  }

  obtenerNombreAsesor(item: any): string {
    if (!item?.asesor) return 'Sin Asesor';
    if (typeof item.asesor === 'object') {
      return item.asesor.nombre || item.asesor.username || 'Sin Asesor';
    }
    const found = this.asesoresList.find(a => String(a._id) === String(item.asesor));
    return found ? (found.nombre || found.username) : 'Asesor Asignado';
  }
}
