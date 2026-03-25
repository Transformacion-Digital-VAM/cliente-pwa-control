import { Component, OnInit, Inject, PLATFORM_ID } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { forkJoin } from 'rxjs';
import { GrupoService } from '../../../../core/services/grupo.service';
import { ClienteService } from '../../../../core/services/cliente.service';
import { NotificationService } from '../../../../core/services/notification.service';
import { environment } from '../../../../../environments/environment';
import Swal from 'sweetalert2';

@Component({
  selector: 'app-admin-home',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule],
  templateUrl: './admin-home.html',
  styleUrl: './admin-home.css',
})
export class AdminHome implements OnInit {
  elementosPrincipales: any[] = [];
  grupos: any[] = [];
  creditos: any[] = [];
  asesoresList: any[] = [];
  coordinacionesList: any[] = [];
  expandedGroups: { [key: string]: boolean } = {};
  isLoading: boolean = true;

  // Filtros
  searchTerm: string = '';
  selectedCoordinacionId: string = 'todas';
  selectedAsesorId: string = 'todos';
  activeTab: 'grupos' | 'individuales' = 'grupos';

  constructor(
    @Inject(PLATFORM_ID) private platformId: Object,
    private grupoService: GrupoService,
    private clienteService: ClienteService,
    private notificationService: NotificationService
  ) { }

  ngOnInit() {
    if (isPlatformBrowser(this.platformId)) {
      this.cargarDatos();
    }
  }

  refrescarDatos() {
    this.cargarDatos();
  }

  selectCoordinacion(coordId: string) {
    this.selectedCoordinacionId = coordId;
    this.selectedAsesorId = 'todos';
  }

  cargarDatos() {
    this.isLoading = true;
    forkJoin({
      miembros: this.grupoService.getMiembros(),
      creditos: this.grupoService.getCreditos(),
      asesores: this.grupoService.getAsesores(),
      clientes: this.clienteService.getClientes(),
      coordinaciones: this.grupoService.getCoordinaciones()
    }).subscribe({
      next: (res: any) => {
        // Guardar asesores y coordinaciones
        this.asesoresList = res.asesores || [];
        this.coordinacionesList = res.coordinaciones || [];

        // Extraer coordinaciones únicas
        const coordMap = new Map();
        this.asesoresList.forEach(a => {
          let coordId = null;
          if (a.coordinacion && typeof a.coordinacion === 'object' && a.coordinacion._id) {
            coordId = a.coordinacion._id; // Por si acaso sí viene poblado en algún momento
          } else if (a.coordinacion) {
            coordId = a.coordinacion; // Es un string directamente del backend
          }

          if (coordId) {
            coordMap.set(coordId, {
              _id: coordId,
              nombre: `Coordinación ${coordId.toString().substring(coordId.toString().length - 4)}` // Nombre genérico porque no tenemos el real
            });
          }
        });
         // Coordinaciones cargadas desde el servicio

        // Mapear grupos desde miembros
        const tempGrupos: { [key: string]: any } = {};
        if (res.miembros) {
          res.miembros.forEach((m: any) => {
            if (m.grupo && m.grupo._id) {
              const gId = m.grupo._id;
              if (!tempGrupos[gId]) {
                tempGrupos[gId] = { ...m.grupo, integrantes: [], tipo: 'GRUPO' };
              }
              tempGrupos[gId].integrantes.push(m);
            }
          });
        }
        this.grupos = Object.values(tempGrupos);

        // Procesar clientes individuales
        const clientesInd = res.clientes ? res.clientes.map((c: any) => ({
          ...c,
          tipo: 'INDIVIDUAL'
        })) : [];

        // Combinar en lista principal
        this.elementosPrincipales = [...this.grupos, ...clientesInd];

        // Guardar créditos
        this.creditos = res.creditos.creditos || res.creditos;

        // Verificar si alguna hoja de control se completó → notificar
        this.notificationService.verificarHojasCompletadas(
          this.grupos,
          this.creditos,
          res.miembros || []
        );

        this.isLoading = false;
      },
      error: (err) => {
        console.error('Error cargando datos', err);
        this.isLoading = false;
      }
    });
  }

  get filteredAsesoresList() {
    if (this.selectedCoordinacionId === 'todas') {
      return this.asesoresList;
    }
    return this.asesoresList.filter(a => {
      const aCoordId = (a.coordinacion && typeof a.coordinacion === 'object') ? a.coordinacion._id : a.coordinacion;
      return aCoordId === this.selectedCoordinacionId;
    });
  }

  get filteredGrupos() {
    return this.filteredElementos; // Hacemos alias para evitar modificar demasiado si hay usos externos, aunque preferiremos filteredElementos
  }

  get filteredElementos() {
    return this.elementosPrincipales.filter(item => {
      // Filtrar por Pestaña Activa (Grupos vs Individuales)
      if (this.activeTab === 'grupos' && item.tipo !== 'GRUPO') return false;
      if (this.activeTab === 'individuales' && item.tipo !== 'INDIVIDUAL') return false;

      // Filtrar por Coordinación
      if (this.selectedCoordinacionId !== 'todas') {
        const itemAsesorId = item.asesor?._id || item.asesor;
        const idAComparar = typeof itemAsesorId === 'object' ? itemAsesorId?._id : itemAsesorId;
        const asesorDelElemento = this.asesoresList.find(a => a._id === idAComparar);

        if (!asesorDelElemento || !asesorDelElemento.coordinacion) return false;

        const aCoordId = (asesorDelElemento.coordinacion && typeof asesorDelElemento.coordinacion === 'object') ? asesorDelElemento.coordinacion._id : asesorDelElemento.coordinacion;
        if (aCoordId !== this.selectedCoordinacionId) {
          return false;
        }
      }

      // Filtrar por Asesor (Tab)
      if (this.selectedAsesorId !== 'todos') {
        const itemAsesorId = item.asesor?._id || item.asesor;
        // convert objects if they exist
        const idAComparar = typeof itemAsesorId === 'object' ? itemAsesorId?._id : itemAsesorId;
        if (idAComparar !== this.selectedAsesorId) {
          return false;
        }
      }

      // Filtrar por Búsqueda (Texto)
      if (this.searchTerm && this.searchTerm.trim() !== '') {
        const term = this.searchTerm.toLowerCase();
        const matchClave = item.clave && item.clave.toString().toLowerCase().includes(term);
        const matchNombre = item.nombre && item.nombre.toLowerCase().includes(term);
        if (!matchClave && !matchNombre) return false;
      }

      return true;
    });
  }

  getCreditoDeMiembro(miembroId: string) {
    return this.creditos.find(c =>
      c.miembro && (c.miembro._id === miembroId || c.miembro === miembroId)
    );
  }

  getCreditoDeCliente(clienteId: string) {
    return this.creditos.find(c =>
      c.cliente && (c.cliente._id === clienteId || c.cliente === clienteId)
    );
  }

  descargarInfoGrupo(grupo: any, event: Event) {
    event.stopPropagation();
    
    // Buscar el ciclo del grupo a partir de sus créditos
    let ciclo = 1;
    if (grupo.integrantes && grupo.integrantes.length > 0) {
      const primerMiembro = grupo.integrantes[0];
      const credito = this.getCreditoDeMiembro(primerMiembro._id);
      if (credito && credito.ciclo) {
        ciclo = credito.ciclo;
      }
    }

    // Descargar el PDF completo (3 hojas juntas)
    const url = `${environment.apiUrl}/creditos/hoja-control/${grupo._id}/${ciclo}`;
    window.open(url, '_blank');
  }

  descargarInfoGrupoLlena(grupo: any, event: Event) {
    event.stopPropagation();
    
    // Buscar el ciclo del grupo a partir de sus créditos
    let ciclo = 1;
    if (grupo.integrantes && grupo.integrantes.length > 0) {
      const primerMiembro = grupo.integrantes[0];
      const credito = this.getCreditoDeMiembro(primerMiembro._id);
      if (credito && credito.ciclo) {
        ciclo = credito.ciclo;
      }
    }

    // Descargar el PDF completo pero lleno
    const url = `${environment.apiUrl}/creditos/hoja-control/${grupo._id}/${ciclo}?llena=true`;
    window.open(url, '_blank');
  }

  descargarInfoIndividual(cliente: any, event: Event) {
    event.stopPropagation();
    
    // Buscar el ciclo del cliente a partir de sus créditos
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
    
    // Buscar el ciclo del cliente a partir de sus créditos
    let ciclo = 1;
    const credito = this.getCreditoDeCliente(cliente._id);
    if (credito && credito.ciclo) {
      ciclo = credito.ciclo;
    }

    const url = `${environment.apiUrl}/creditos/hoja-control-individual/${cliente._id}/${ciclo}?llena=true`;
    window.open(url, '_blank');
  }

  limpiarFiltros() {
    this.searchTerm = '';
    this.selectedCoordinacionId = 'todas';
    this.activeTab = 'grupos';
  }

  getNombreCoordinacion(id: any): string {
    if (!id) return 'Sin Coor.';
    const idStr = typeof id === 'object' ? id._id : id;
    const coord = this.coordinacionesList.find(c => c._id === idStr);
    return coord ? coord.nombre : `ID: ${idStr.toString().substring(idStr.toString().length - 4)}`;
  }

  toggleGroup(groupId: string) {
    this.expandedGroups[groupId] = !this.expandedGroups[groupId];
  }
}
