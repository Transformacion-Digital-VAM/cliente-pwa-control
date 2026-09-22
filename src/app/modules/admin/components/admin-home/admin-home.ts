import { Component, OnInit, Inject, PLATFORM_ID, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { forkJoin } from 'rxjs';
import { GrupoService } from '../../../../core/services/grupo.service';
import { ClienteService } from '../../../../core/services/cliente.service';
import { NotificationService } from '../../../../core/services/notification.service';
import { environment } from '../../../../../environments/environment';
import Swal from 'sweetalert2';
import { UppercaseDirective } from '../../uppercase.directive';

@Component({
  selector: 'app-admin-home',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule, UppercaseDirective],
  templateUrl: './admin-home.html',
  styleUrl: './admin-home.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AdminHome implements OnInit {
  elementosPrincipales: any[] = [];
  elementosFiltrados: any[] = [];
  asesoresDeCoordinacion: any[] = [];
  asesoresFiltrados: any[] = [];

  grupos: any[] = [];
  creditos: any[] = [];
  asesoresList: any[] = [];
  coordinacionesList: any[] = [];
  expandedGroups: { [key: string]: boolean } = {};
  isLoading: boolean = true;

  // Hash Maps para acceso O(1)
  creditoMiembroMap: Map<string, any> = new Map();
  creditoClienteMap: Map<string, any> = new Map();
  asesoresMap: Map<string, any> = new Map();
  coordinacionesMap: Map<string, any> = new Map();

  // Contadores precalculados para tabs
  coordinacionCounts: { [key: string]: number } = {};
  asesorCounts: { [key: string]: number } = {};

  // Filtros
  searchTerm: string = '';
  asesorSearchTerm: string = '';
  selectedCoordinacionId: string = 'todas';
  selectedAsesorId: string = 'todos';
  activeTab: 'grupos' | 'individuales' = 'grupos';

  userRole: string = '';
  userCoordinacion: string = '';

  constructor(
    @Inject(PLATFORM_ID) private platformId: Object,
    private grupoService: GrupoService,
    private clienteService: ClienteService,
    private notificationService: NotificationService,
    private cdr: ChangeDetectorRef
  ) { }

  get isGlobalRole(): boolean {
    return ['admin', 'superadmin', 'lector'].includes(this.userRole);
  }

  get isAdmin(): boolean {
    return ['admin', 'master', 'superadmin'].includes((this.userRole || '').toLowerCase());
  }

  get filteredAsesoresList(): any[] {
    return this.asesoresDeCoordinacion;
  }

  get filteredAsesoresListBySearch(): any[] {
    return this.asesoresFiltrados;
  }

  get filteredElementos(): any[] {
    return this.elementosFiltrados;
  }

  ngOnInit() {
    if (isPlatformBrowser(this.platformId)) {
      this.userRole = localStorage.getItem('userRole') || '';
      const userStr = localStorage.getItem('user');
      if (userStr) {
        try {
          const u = JSON.parse(userStr);
          const rawCoord = u.coordinacion;
          if (rawCoord && typeof rawCoord === 'object') {
            this.userCoordinacion = rawCoord.$oid || rawCoord._id || rawCoord.id || '';
          } else {
            this.userCoordinacion = rawCoord || '';
          }
        } catch (e) { }
      }

      if (!this.isGlobalRole && this.userCoordinacion) {
        this.selectedCoordinacionId = this.userCoordinacion;
      } else {
        this.selectedCoordinacionId = 'todas';
      }

      this.cargarDatos();
    }
  }

  refrescarDatos() {
    this.grupoService.limpiarCache();
    this.cargarDatos(true);
  }

  cambiarTab(tab: 'grupos' | 'individuales') {
    this.activeTab = tab;
    this.selectedAsesorId = 'todos';
    this.aplicarFiltros();
  }

  selectCoordinacion(coordId: string) {
    this.selectedCoordinacionId = coordId;
    this.selectedAsesorId = 'todos';
    this.actualizarAsesoresDeCoordinacion();
    this.aplicarFiltros();
  }

  selectAsesor(asesorId: string) {
    this.selectedAsesorId = asesorId;
    this.aplicarFiltros();
  }

  onSearchChange() {
    this.aplicarFiltros();
  }

  onAsesorSearchChange() {
    this.filtrarAsesores();
    this.cdr.markForCheck();
  }

  cargarDatos(forceRefresh = false) {
    this.isLoading = true;
    this.cdr.markForCheck();

    // 1. CARGA: Coordinaciones, Asesores, Grupos y Clientes
    forkJoin({
      grupos: this.grupoService.getGrupos(forceRefresh),
      asesores: this.grupoService.getAsesores(forceRefresh),
      clientes: this.clienteService.getClientes(),
      coordinaciones: this.grupoService.getCoordinaciones(forceRefresh)
    }).subscribe({
      next: (res: any) => {
        const allAsesores = res.asesores || [];
        const allCoordinaciones = res.coordinaciones || [];
        const allGruposRaw = res.grupos || [];
        const allClientesRaw = res.clientes || [];

        // 1. Filtrado por rol si es restringido
        const isRestricted = !this.isGlobalRole && !!this.userCoordinacion;

        if (isRestricted) {
          this.asesoresList = allAsesores.filter((a: any) => {
            const aCoordId = (a.coordinacion && typeof a.coordinacion === 'object') ? (a.coordinacion._id || a.coordinacion.id) : a.coordinacion;
            return aCoordId && String(aCoordId) === String(this.userCoordinacion);
          });
          this.coordinacionesList = allCoordinaciones.filter((c: any) => String(c._id) === String(this.userCoordinacion));
        } else {
          this.asesoresList = allAsesores;
          this.coordinacionesList = allCoordinaciones;
        }

        // 2. asesores y coordinaciones
        this.asesoresMap.clear();
        for (const a of allAsesores) {
          this.asesoresMap.set(String(a._id), a);
        }

        this.coordinacionesMap.clear();
        for (const c of allCoordinaciones) {
          this.coordinacionesMap.set(String(c._id), c);
        }

        // 3. Procesar Grupos
        const gruposProcesados: any[] = [];
        for (const g of allGruposRaw) {
          const integrantesDirectos = g.integrantes || [];
          const grupoObj = {
            ...g,
            integrantes: integrantesDirectos,
            tipo: 'GRUPO',
            estadoGrupo: g.estadoGrupo || null,
            coordinacionNombre: this.resolverNombreCoordinacion(g)
          };

          if (!isRestricted || this.perteneceACoordinacion(grupoObj, this.userCoordinacion)) {
            gruposProcesados.push(grupoObj);
          }
        }

        // 4. Clientes Individuales
        const clientesProcesados: any[] = [];
        for (const c of allClientesRaw) {
          const clienteObj = {
            ...c,
            tipo: 'INDIVIDUAL',
            coordinacionNombre: this.resolverNombreCoordinacion(c),
            credito: this.creditoClienteMap.get(String(c._id)) || null
          };
          if (!isRestricted || this.perteneceACoordinacion(clienteObj, this.userCoordinacion)) {
            clientesProcesados.push(clienteObj);
          }
        }

        this.grupos = gruposProcesados;
        this.elementosPrincipales = [...this.grupos, ...clientesProcesados];

        // Actualizar Asesores de la coordinación activa y renderizar interfaz
        this.actualizarAsesoresDeCoordinacion();
        this.aplicarFiltros();


        this.isLoading = false;
        this.cdr.markForCheck();


        this.cargarCreditosEnSegundoPlano(forceRefresh);
      },
      error: (err) => {
        console.error('Error cargando datos principales', err);
        this.isLoading = false;
        this.cdr.markForCheck();
      }
    });
  }

  private cargarCreditosEnSegundoPlano(forceRefresh = false) {
    forkJoin({
      creditos: this.grupoService.getCreditos({}, forceRefresh),
      miembros: this.grupoService.getMiembros(forceRefresh)
    }).subscribe({
      next: (res: any) => {
        const rawCreditos = res.creditos?.creditos || res.creditos || [];
        this.creditos = Array.isArray(rawCreditos) ? rawCreditos : [];
        const allMiembrosRaw = res.miembros || [];

        this.creditoMiembroMap.clear();
        this.creditoClienteMap.clear();

        for (const c of this.creditos) {
          const totalSemanas = c.semanas || 16;
          let maxPago = 0;
          let ultimoPago = null;

          if (c.pagos && Array.isArray(c.pagos) && c.pagos.length > 0) {
            const numerosPagos = c.pagos.map((p: any) => p.numeroPago || 0);
            maxPago = Math.max(...numerosPagos);
            const rawUltimo = c.pagos[c.pagos.length - 1];
            if (rawUltimo) {
              let fPago = rawUltimo.fechaPago;
              if (fPago) {
                const fecha = new Date(fPago);
                fecha.setHours(fecha.getHours() + 6);
                fPago = fecha;
              }
              ultimoPago = {
                ...rawUltimo,
                fechaPago: fPago
              };
            }
          }

          c._progreso = `${maxPago}/${totalSemanas}`;
          c._ultimoPago = ultimoPago;

          const mId = c.miembro?._id || c.miembro;
          if (mId) {
            const key = String(mId);
            const actual = this.creditoMiembroMap.get(key);
            if (!actual) {
              this.creditoMiembroMap.set(key, c);
            } else {
              const esActivo = c.estado === 'Activo';
              const actualEsActivo = actual.estado === 'Activo';
              const cicloC = Number(c.ciclo) || 0;
              const cicloActual = Number(actual.ciclo) || 0;
              if ((esActivo && !actualEsActivo) || (esActivo === actualEsActivo && cicloC > cicloActual)) {
                this.creditoMiembroMap.set(key, c);
              }
            }
          }

          const clId = c.cliente?._id || c.cliente;
          if (clId) {
            const key = String(clId);
            const actual = this.creditoClienteMap.get(key);
            if (!actual) {
              this.creditoClienteMap.set(key, c);
            } else {
              const esActivo = c.estado === 'Activo';
              const actualEsActivo = actual.estado === 'Activo';
              const cicloC = Number(c.ciclo) || 0;
              const cicloActual = Number(actual.ciclo) || 0;
              if ((esActivo && !actualEsActivo) || (esActivo === actualEsActivo && cicloC > cicloActual)) {
                this.creditoClienteMap.set(key, c);
              }
            }
          }
        }

        // Enlazar créditos a integrantes de grupos y clientes
        for (const g of this.grupos) {
          if (g.integrantes && g.integrantes.length > 0) {
            for (const m of g.integrantes) {
              m.credito = this.creditoMiembroMap.get(String(m._id || m)) || null;
            }
            if (!g.estadoGrupo) {
              for (const m of g.integrantes) {
                const cred = this.creditoMiembroMap.get(String(m._id || m));
                if (cred?.estadoGrupo) {
                  g.estadoGrupo = cred.estadoGrupo;
                  break;
                }
              }
            }
          }
        }

        for (const item of this.elementosPrincipales) {
          if (item.tipo === 'INDIVIDUAL') {
            item.credito = this.creditoClienteMap.get(String(item._id)) || null;
          }
        }

        this.notificationService.verificarHojasCompletadas(
          this.grupos,
          this.creditos,
          allMiembrosRaw
        );

        this.aplicarFiltros();
        this.cdr.detectChanges();
      },
      error: (err) => console.error('Error enriqueciendo créditos en segundo plano', err)
    });
  }

  private perteneceACoordinacion(item: any, coordId: string): boolean {
    if (!coordId) return true;
    let itemCoordId = item.coordinacion?._id || item.coordinacion;
    if (!itemCoordId && item.asesor) {
      const asId = item.asesor?._id || item.asesor;
      const asInfo = this.asesoresMap.get(String(asId));
      if (asInfo) itemCoordId = asInfo.coordinacion?._id || asInfo.coordinacion;
    }
    return itemCoordId && String(itemCoordId) === String(coordId);
  }

  private resolverNombreCoordinacion(item: any): string {
    if (!item) return 'Sin Coor.';
    let idStr = item.coordinacion?._id || item.coordinacion;
    if (!idStr && item.asesor) {
      const asId = item.asesor?._id || item.asesor;
      const asInfo = this.asesoresMap.get(String(asId));
      if (asInfo) idStr = asInfo.coordinacion?._id || asInfo.coordinacion;
    }
    if (!idStr) return 'Sin Coor.';

    const coordObj = this.coordinacionesMap.get(String(idStr));
    if (coordObj && coordObj.nombre) {
      return coordObj.nombre;
    }
    return `Coordinación ${idStr.toString().substring(idStr.toString().length - 4)}`;
  }

  actualizarAsesoresDeCoordinacion() {
    if (this.selectedCoordinacionId === 'todas') {
      this.asesoresDeCoordinacion = this.asesoresList;
    } else {
      this.asesoresDeCoordinacion = this.asesoresList.filter(a => {
        const aCoordId = (a.coordinacion && typeof a.coordinacion === 'object') ? (a.coordinacion._id || a.coordinacion.id) : a.coordinacion;
        return String(aCoordId) === String(this.selectedCoordinacionId);
      });
    }
    this.filtrarAsesores();
  }

  filtrarAsesores() {
    if (!this.asesorSearchTerm || !this.asesorSearchTerm.trim()) {
      this.asesoresFiltrados = this.asesoresDeCoordinacion;
      return;
    }
    const term = this.asesorSearchTerm.toLowerCase().trim();
    this.asesoresFiltrados = this.asesoresDeCoordinacion.filter(a => (a.nombre || a.username || '').toLowerCase().includes(term));
  }

  aplicarFiltros() {
    const targetTipo = this.activeTab === 'grupos' ? 'GRUPO' : 'INDIVIDUAL';
    const filterCoord = this.selectedCoordinacionId !== 'todas';
    const filterAsesor = this.selectedAsesorId !== 'todos';
    const hasSearch = !!(this.searchTerm && this.searchTerm.trim() !== '');
    const term = hasSearch ? this.searchTerm.toLowerCase().trim() : '';

    const cCounts: { [key: string]: number } = {};
    const aCounts: { [key: string]: number } = {};
    const filtrados: any[] = [];

    for (const item of this.elementosPrincipales) {
      if (item.tipo !== targetTipo) continue;

      // Calcular contadores
      let coordId = item.coordinacion?._id || item.coordinacion;
      if (!coordId && item.asesor) {
        const asId = item.asesor?._id || item.asesor;
        const asInfo = this.asesoresMap.get(String(asId));
        if (asInfo) coordId = asInfo.coordinacion?._id || asInfo.coordinacion;
      }
      if (coordId) {
        const cKey = String(coordId);
        cCounts[cKey] = (cCounts[cKey] || 0) + 1;
      }

      const itemAsesorId = item.asesor?._id || item.asesor;
      let asesorKey = '';
      if (itemAsesorId) {
        asesorKey = String(typeof itemAsesorId === 'object' ? itemAsesorId._id : itemAsesorId);
        aCounts[asesorKey] = (aCounts[asesorKey] || 0) + 1;
      }

      // Evaluar si pasa los filtros activos
      if (filterCoord && String(coordId) !== String(this.selectedCoordinacionId)) {
        continue;
      }
      if (filterAsesor && String(asesorKey) !== String(this.selectedAsesorId)) {
        continue;
      }
      if (hasSearch) {
        const matchClave = item.clave && item.clave.toString().toLowerCase().includes(term);
        const matchNombre = item.nombre && item.nombre.toLowerCase().includes(term);
        if (!matchClave && !matchNombre) continue;
      }

      filtrados.push(item);
    }

    this.coordinacionCounts = cCounts;
    this.asesorCounts = aCounts;
    this.elementosFiltrados = filtrados;
    this.cdr.markForCheck();
  }

  trackById(index: number, item: any): string {
    return item?._id || item?.id || String(index);
  }

  getCountByCoordinacion(coordId: string): number {
    return this.coordinacionCounts[coordId] || 0;
  }

  getCountByAsesor(asesorId: string): number {
    return this.asesorCounts[asesorId] || 0;
  }

  getCreditoDeMiembro(miembroId: string) {
    if (!miembroId) return null;
    return this.creditoMiembroMap.get(String(miembroId)) || null;
  }

  getCreditoDeCliente(clienteId: string) {
    if (!clienteId) return null;
    return this.creditoClienteMap.get(String(clienteId)) || null;
  }

  getNombreCoordinacion(item: any): string {
    return item?.coordinacionNombre || 'Sin Coor.';
  }

  getProgresoPagos(credito: any): string {
    return credito?._progreso || '0/16';
  }

  getUltimoPago(credito: any): any {
    return credito?._ultimoPago || null;
  }

  toggleGroup(groupId: string) {
    this.expandedGroups[groupId] = !this.expandedGroups[groupId];
    this.cdr.markForCheck();
  }

  limpiarFiltros() {
    this.searchTerm = '';
    this.asesorSearchTerm = '';
    if (!this.isGlobalRole && this.userCoordinacion) {
      this.selectedCoordinacionId = this.userCoordinacion;
    } else {
      this.selectedCoordinacionId = 'todas';
    }
    this.selectedAsesorId = 'todos';
    this.activeTab = 'grupos';
    this.actualizarAsesoresDeCoordinacion();
    this.aplicarFiltros();
  }

  getCicloActualGrupo(grupo: any): number {
    if (!grupo) return 1;
    let maxCiclo = Number(grupo.cicloActual) || 0;

    if (grupo.integrantes && Array.isArray(grupo.integrantes)) {
      for (const m of grupo.integrantes) {
        const mId = m._id || m;
        const cred = this.getCreditoDeMiembro(mId);
        if (cred) {
          const cCiclo = Number(cred.ciclo) || 0;
          if (cred.estado === 'Activo' && cCiclo > 0) {
            return cCiclo;
          }
          if (cCiclo > maxCiclo) {
            maxCiclo = cCiclo;
          }
        }
      }
    }

    return maxCiclo > 0 ? maxCiclo : 1;
  }

  getCicloActualCliente(cliente: any): number {
    if (!cliente) return 1;
    const cred = this.getCreditoDeCliente(cliente._id);
    if (cred && cred.ciclo) {
      return Number(cred.ciclo) || 1;
    }
    return 1;
  }

  async descargarInfoGrupo(grupo: any, event: Event) {
    event.stopPropagation();

    const ciclo = this.getCicloActualGrupo(grupo);

    const { value: opcionSeleccionada, isConfirmed } = await Swal.fire({
      title: 'Hoja de Control',
      text: 'Selecciona cómo deseas imprimir la hoja:',
      input: 'select',
      inputOptions: {
        'completa': 'Completa (Todas las semanas)',
        '1': 'Semana 1 a 8',
        '9': 'Semana 9 a 16'
      },
      inputPlaceholder: 'Selecciona una opción',
      showCancelButton: true,
      confirmButtonText: 'Generar',
      cancelButtonText: 'Cancelar',
      inputValidator: (value) => {
        if (!value) {
          return 'Debes seleccionar una opción';
        }
        return null;
      }
    });

    if (isConfirmed && opcionSeleccionada) {
      const estadoGrupo = grupo.estadoGrupo ? `&estadoGrupo=${grupo.estadoGrupo}` : '';
      let url = `${environment.apiUrl}/creditos/hoja-control/${grupo._id}/${ciclo}`;
      if (opcionSeleccionada !== 'completa') {
        url += `?semanaInicio=${opcionSeleccionada}${estadoGrupo}`;
      } else if (estadoGrupo) {
        url += `?${estadoGrupo.slice(1)}`;
      }
      window.open(url, '_blank');
    }
  }

  async descargarInfoGrupoLlena(grupo: any, event: Event) {
    event.stopPropagation();

    const ciclo = this.getCicloActualGrupo(grupo);

    const { value: opcionSeleccionada, isConfirmed } = await Swal.fire({
      title: 'Hoja de Control (Llena)',
      text: 'Selecciona cómo deseas imprimir la hoja:',
      input: 'select',
      inputOptions: {
        'completa': 'Completa (Todas las semanas)',
        '1': 'Semana 1 a 8',
        '9': 'Semana 9 a 16'
      },
      inputPlaceholder: 'Selecciona una opción',
      showCancelButton: true,
      confirmButtonText: 'Generar',
      cancelButtonText: 'Cancelar',
      inputValidator: (value) => {
        if (!value) {
          return 'Debes seleccionar una opción';
        }
        return null;
      }
    });

    if (isConfirmed && opcionSeleccionada) {
      const estadoGrupo = grupo.estadoGrupo ? `&estadoGrupo=${grupo.estadoGrupo}` : '';
      let url = `${environment.apiUrl}/creditos/hoja-control/${grupo._id}/${ciclo}?llena=true`;
      url += estadoGrupo;
      if (opcionSeleccionada !== 'completa') {
        url += `&semanaInicio=${opcionSeleccionada}`;
      }
      window.open(url, '_blank');
    }
  }

  descargarInfoIndividual(cliente: any, event: Event) {
    event.stopPropagation();

    const ciclo = this.getCicloActualCliente(cliente);

    const url = `${environment.apiUrl}/creditos/hoja-control-individual/${cliente._id}/${ciclo}`;
    window.open(url, '_blank');
  }

  descargarInfoIndividualLlena(cliente: any, event: Event) {
    event.stopPropagation();

    const ciclo = this.getCicloActualCliente(cliente);

    const url = `${environment.apiUrl}/creditos/hoja-control-individual/${cliente._id}/${ciclo}?llena=true`;
    window.open(url, '_blank');
  }

  async vistaPreviaGrupo(grupo: any, event: Event) {
    event.stopPropagation();

    const ciclo = this.getCicloActualGrupo(grupo);

    const { value: formValues, isConfirmed } = await Swal.fire({
      title: 'Vista Previa del PDF',
      html: `
        <div style="text-align: left; padding-top: 8px;">
          <div style="margin-bottom: 16px;">
            <label style="display: block; font-size: 11px; font-weight: 700; color: #475569; text-transform: uppercase; margin-bottom: 4px;">Tipo de Hoja</label>
            <select id="swal-tipo-hoja" style="width: 100%; padding: 8px 12px; border: 1px solid #cbd5e1; border-radius: 8px; font-size: 14px; background-color: #fff;">
              <option value="llena">Hoja Llena (con datos)</option>
              <option value="vacia">Hoja Vacía (en blanco)</option>
            </select>
          </div>
          <div>
            <label style="display: block; font-size: 11px; font-weight: 700; color: #475569; text-transform: uppercase; margin-bottom: 4px;">Rango de Semanas</label>
            <select id="swal-rango-semanas" style="width: 100%; padding: 8px 12px; border: 1px solid #cbd5e1; border-radius: 8px; font-size: 14px; background-color: #fff;">
              <option value="completa">Completa (Todas las semanas)</option>
              <option value="1">Semana 1 a 8</option>
              <option value="9">Semana 9 a 16</option>
            </select>
          </div>
        </div>
      `,
      focusConfirm: false,
      showCancelButton: true,
      confirmButtonText: 'Ver Vista Previa',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#9333ea',
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
        url += `&llena=true`;
      }
      if (formValues.rango !== 'completa') {
        url += `&semanaInicio=${formValues.rango}`;
      }
      window.open(url, '_blank');
    }
  }

  async vistaPreviaIndividual(cliente: any, event: Event) {
    event.stopPropagation();

    const ciclo = this.getCicloActualCliente(cliente);

    const { value: tipo, isConfirmed } = await Swal.fire({
      title: 'Vista Previa Individual',
      text: 'Selecciona el formato a previsualizar:',
      input: 'select',
      inputOptions: {
        'llena': 'Hoja Llena (con datos)',
        'vacia': 'Hoja Vacía (en blanco)'
      },
      inputPlaceholder: 'Selecciona una opción',
      showCancelButton: true,
      confirmButtonText: 'Ver Vista Previa',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#9333ea',
      inputValidator: (value) => {
        if (!value) {
          return 'Debes seleccionar una opción';
        }
        return null;
      }
    });

    if (isConfirmed && tipo) {
      let url = `${environment.apiUrl}/creditos/hoja-control-individual/${cliente._id}/${ciclo}?preview=true`;
      if (tipo === 'llena') {
        url += `&llena=true`;
      }
      window.open(url, '_blank');
    }
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

  abrirModalCancelarCredito(credito: any, titularNombre: string, event?: Event): void {
    if (event) {
      event.stopPropagation();
    }
    if (!credito?._id) return;

    const saldo = this.calcularSaldoPendiente(credito);

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
            <select id="swal-motivo" class="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-sm font-semibold text-slate-800 outline-none focus:border-blue-600 focus:bg-white focus:ring-2 focus:ring-blue-100">
              <option value="CANCELACION_REFILL">Cancelación por Refill</option>
              <option value="CAMBIO_CICLO">Cancelación por Cambio de Ciclo</option>
              <option value="OTRO">Otro ajuste justificado</option>
            </select>
          </div>

          <div class="mt-2">
            <label class="block text-xs font-bold text-slate-700 uppercase mb-1">Nota adicional (opcional)</label>
            <input id="swal-notas" type="text" placeholder="Ej. El saldo remanente se incluyó en nuevo crédito..." class="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-sm outline-none focus:border-blue-600 focus:bg-white focus:ring-2 focus:ring-blue-100">
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
        const selectEl = document.getElementById('swal-motivo') as HTMLSelectElement;
        const inputEl = document.getElementById('swal-notas') as HTMLInputElement;
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
            // Actualizar localmente el objeto de crédito
            credito.saldoPendiente = 0;
            credito.estado = 'Liquidado';
            credito.motivoCancelacion = motivo;
            credito.justificacionCancelacion = notas ? `${justificacion}: ${notas}` : justificacion;

            this.cdr.markForCheck();

            Swal.fire({
              icon: 'success',
              title: 'Crédito Saldado a $0',
              text: 'El crédito anterior ha sido justificado y cerrado en $0 exitosamente. Ya puedes registrar el nuevo crédito.',
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

  abrirModalSaldarGrupo(item: any, event: Event): void {
    event.stopPropagation();
    this.expandedGroups[item._id] = true;
    this.cdr.detectChanges();

    const integrantes = item.integrantes || [];
    const conCredito = integrantes.filter((m: any) => m.credito && m.credito.estado !== 'Liquidado');

    if (!conCredito.length) {
      Swal.fire({
        icon: 'info',
        title: item.nombre,
        text: 'Todos los créditos de este grupo ya están liquidados o en $0, o no tienen créditos activos registrados.',
        confirmButtonColor: '#2563eb'
      });
      return;
    }

    Swal.fire({
      icon: 'info',
      title: item.nombre,
      text: `Se han desplegado ${conCredito.length} integrante(s) con crédito activo. En la columna "Acción" de cada integrante puedes presionar "Cancelar por Refill" para justificar y liquidar su adeudo.`,
      confirmButtonText: 'Ver integrantes',
      confirmButtonColor: '#d97706'
    });
  }
}