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
    return ['admin', 'master', 'superadmin'].includes(this.userRole);
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
    this.cargarDatos();
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

  cargarDatos() {
    this.isLoading = true;
    this.cdr.markForCheck();

    forkJoin({
      grupos: this.grupoService.getGrupos(),
      miembros: this.grupoService.getMiembros(),
      creditos: this.grupoService.getCreditos(),
      asesores: this.grupoService.getAsesores(),
      clientes: this.clienteService.getClientes(),
      coordinaciones: this.grupoService.getCoordinaciones()
    }).subscribe({
      next: (res: any) => {
        const allAsesores = res.asesores || [];
        const allCoordinaciones = res.coordinaciones || [];
        const allGruposRaw = res.grupos || [];
        const allMiembrosRaw = res.miembros || [];
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

        // 2. Poblar mapas de asesores y coordinaciones O(1)
        this.asesoresMap.clear();
        for (const a of allAsesores) {
          this.asesoresMap.set(String(a._id), a);
        }

        this.coordinacionesMap.clear();
        for (const c of allCoordinaciones) {
          this.coordinacionesMap.set(String(c._id), c);
        }

        // 3. Procesar y Mapear Créditos O(1) con métricas precalculadas
        const rawCreditos = res.creditos?.creditos || res.creditos || [];
        this.creditos = Array.isArray(rawCreditos) ? rawCreditos : [];

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
            this.creditoMiembroMap.set(String(mId), c);
          }

          const clId = c.cliente?._id || c.cliente;
          if (clId) {
            this.creditoClienteMap.set(String(clId), c);
          }
        }

        // 4. Procesar Grupos: Asociar integrantes y vincular créditos directamente
        const miembrosPorGrupo = new Map<string, any[]>();
        for (const m of allMiembrosRaw) {
          const gId = m.grupo?._id || m.grupo;
          if (gId) {
            const gKey = String(gId);
            if (!miembrosPorGrupo.has(gKey)) {
              miembrosPorGrupo.set(gKey, []);
            }
            m.credito = this.creditoMiembroMap.get(String(m._id)) || null;
            miembrosPorGrupo.get(gKey)!.push(m);
          }
        }

        const gruposProcesados: any[] = [];
        const gruposVistos = new Set<string>();

        for (const g of allGruposRaw) {
          const gId = String(g._id);
          gruposVistos.add(gId);
          const integrantesDirectos = (g.integrantes && g.integrantes.length > 0) ? g.integrantes : (miembrosPorGrupo.get(gId) || []);

          for (const m of integrantesDirectos) {
            m.credito = this.creditoMiembroMap.get(String(m._id)) || null;
          }

          const grupoObj = {
            ...g,
            integrantes: integrantesDirectos,
            tipo: 'GRUPO',
            coordinacionNombre: this.resolverNombreCoordinacion(g)
          };

          if (!isRestricted || this.perteneceACoordinacion(grupoObj, this.userCoordinacion)) {
            gruposProcesados.push(grupoObj);
          }
        }

        for (const [gId, integrantes] of miembrosPorGrupo.entries()) {
          if (!gruposVistos.has(gId) && integrantes.length > 0) {
            const baseGrupo = integrantes[0].grupo;
            if (baseGrupo && typeof baseGrupo === 'object') {
              for (const m of integrantes) {
                m.credito = this.creditoMiembroMap.get(String(m._id)) || null;
              }
              const grupoObj = {
                ...baseGrupo,
                integrantes,
                tipo: 'GRUPO',
                coordinacionNombre: this.resolverNombreCoordinacion(baseGrupo)
              };
              if (!isRestricted || this.perteneceACoordinacion(grupoObj, this.userCoordinacion)) {
                gruposProcesados.push(grupoObj);
              }
            }
          }
        }

        // 5. Procesar Clientes Individuales
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

        // 6. Actualizar Asesores de la coordinación activa y aplicar filtros
        this.actualizarAsesoresDeCoordinacion();
        this.aplicarFiltros();

        // 7. Notificaciones
        this.notificationService.verificarHojasCompletadas(
          this.grupos,
          this.creditos,
          allMiembrosRaw
        );

        this.isLoading = false;
        this.cdr.markForCheck();
      },
      error: (err) => {
        console.error('Error cargando datos', err);
        this.isLoading = false;
        this.cdr.markForCheck();
      }
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

  async descargarInfoGrupo(grupo: any, event: Event) {
    event.stopPropagation();

    let ciclo = 1;
    if (grupo.integrantes && grupo.integrantes.length > 0) {
      const primerMiembro = grupo.integrantes[0];
      const credito = this.getCreditoDeMiembro(primerMiembro._id);
      if (credito && credito.ciclo) {
        ciclo = credito.ciclo;
      }
    }

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
      let url = `${environment.apiUrl}/creditos/hoja-control/${grupo._id}/${ciclo}`;
      if (opcionSeleccionada !== 'completa') {
        url += `?semanaInicio=${opcionSeleccionada}`;
      }
      window.open(url, '_blank');
    }
  }

  async descargarInfoGrupoLlena(grupo: any, event: Event) {
    event.stopPropagation();

    let ciclo = 1;
    if (grupo.integrantes && grupo.integrantes.length > 0) {
      const primerMiembro = grupo.integrantes[0];
      const credito = this.getCreditoDeMiembro(primerMiembro._id);
      if (credito && credito.ciclo) {
        ciclo = credito.ciclo;
      }
    }

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
      let url = `${environment.apiUrl}/creditos/hoja-control/${grupo._id}/${ciclo}?llena=true`;
      if (opcionSeleccionada !== 'completa') {
        url += `&semanaInicio=${opcionSeleccionada}`;
      }
      window.open(url, '_blank');
    }
  }

  descargarInfoIndividual(cliente: any, event: Event) {
    event.stopPropagation();

    let ciclo = 1;
    const credito = this.getCreditoDeCliente(cliente._id);
    if (credito && credito.ciclo) {
      ciclo = credito.ciclo;
    }

    const url = `${environment.apiUrl}/creditos/hoja-control-individual/${cliente._id}/${ciclo}`;
    window.open(url, '_blank');
  }

  descargarInfoIndividualLlena(cliente: any, event: Event) {
    event.stopPropagation();

    let ciclo = 1;
    const credito = this.getCreditoDeCliente(cliente._id);
    if (credito && credito.ciclo) {
      ciclo = credito.ciclo;
    }

    const url = `${environment.apiUrl}/creditos/hoja-control-individual/${cliente._id}/${ciclo}?llena=true`;
    window.open(url, '_blank');
  }

  async vistaPreviaGrupo(grupo: any, event: Event) {
    event.stopPropagation();

    let ciclo = 1;
    if (grupo.integrantes && grupo.integrantes.length > 0) {
      const primerMiembro = grupo.integrantes[0];
      const credito = this.getCreditoDeMiembro(primerMiembro._id);
      if (credito && credito.ciclo) {
        ciclo = credito.ciclo;
      }
    }

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

    let ciclo = 1;
    const credito = this.getCreditoDeCliente(cliente._id);
    if (credito && credito.ciclo) {
      ciclo = credito.ciclo;
    }

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
}