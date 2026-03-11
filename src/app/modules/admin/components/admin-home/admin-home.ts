import { Component, OnInit, Inject, PLATFORM_ID } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { forkJoin } from 'rxjs';
import { GrupoService } from '../../../../core/services/grupo.service';
import Swal from 'sweetalert2';

@Component({
  selector: 'app-admin-home',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule],
  templateUrl: './admin-home.html',
  styleUrl: './admin-home.css',
})
export class AdminHome implements OnInit {
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

  constructor(
    @Inject(PLATFORM_ID) private platformId: Object,
    private grupoService: GrupoService
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
      asesores: this.grupoService.getAsesores()
    }).subscribe({
      next: (res: any) => {
        // Guardar asesores
        this.asesoresList = res.asesores || [];

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
        this.coordinacionesList = Array.from(coordMap.values());

        // Mapear grupos desde miembros
        const tempGrupos: { [key: string]: any } = {};
        if (res.miembros) {
          res.miembros.forEach((m: any) => {
            if (m.grupo && m.grupo._id) {
              const gId = m.grupo._id;
              if (!tempGrupos[gId]) {
                tempGrupos[gId] = { ...m.grupo, integrantes: [] };
              }
              tempGrupos[gId].integrantes.push(m);
            }
          });
        }
        this.grupos = Object.values(tempGrupos);

        // Guardar créditos
        this.creditos = res.creditos.creditos || res.creditos;

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
    return this.grupos.filter(g => {
      // Filtrar por Coordinación
      if (this.selectedCoordinacionId !== 'todas') {
        const gAsesorId = g.asesor?._id || g.asesor;
        const idAComparar = typeof gAsesorId === 'object' ? gAsesorId?._id : gAsesorId;
        const asesorDelGrupo = this.asesoresList.find(a => a._id === idAComparar);

        if (!asesorDelGrupo || !asesorDelGrupo.coordinacion) return false;

        const aCoordId = (asesorDelGrupo.coordinacion && typeof asesorDelGrupo.coordinacion === 'object') ? asesorDelGrupo.coordinacion._id : asesorDelGrupo.coordinacion;
        if (aCoordId !== this.selectedCoordinacionId) {
          return false;
        }
      }

      // Filtrar por Asesor (Tab)
      if (this.selectedAsesorId !== 'todos') {
        const gAsesorId = g.asesor?._id || g.asesor;
        // convert objects if they exist
        const idAComparar = typeof gAsesorId === 'object' ? gAsesorId?._id : gAsesorId;
        if (idAComparar !== this.selectedAsesorId) {
          return false;
        }
      }

      // Filtrar por Búsqueda (Texto)
      if (this.searchTerm && this.searchTerm.trim() !== '') {
        const term = this.searchTerm.toLowerCase();
        const matchClave = g.clave && g.clave.toString().toLowerCase().includes(term);
        const matchNombre = g.nombre && g.nombre.toLowerCase().includes(term);
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

  descargarInfoGrupo(grupo: any, event: Event) {
    event.stopPropagation();
    Swal.fire({
      icon: 'info',
      title: 'Función en desarrollo',
      text: `Generar Información del Grupo: ${grupo.nombre}`,
      confirmButtonColor: '#3085d6'
    });
    // Aquí puedes implementar la lógica para exportar a Excel, PDF, etc.
  }

  descargarGarantias(grupo: any, event: Event) {
    event.stopPropagation();
    Swal.fire({
      icon: 'info',
      title: 'Función en desarrollo',
      text: `Generar Tabla de Garantías/Grupo: ${grupo.nombre}`,
      confirmButtonColor: '#3085d6'
    });
    // Aquí puedes implementar la lógica para emitir el reporte final parecido al de la imagen.
  }

  toggleGroup(groupId: string) {
    this.expandedGroups[groupId] = !this.expandedGroups[groupId];
  }
}
