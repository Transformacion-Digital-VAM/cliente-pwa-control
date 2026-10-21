import { Component, OnInit, ChangeDetectorRef, Inject, PLATFORM_ID } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { forkJoin } from 'rxjs';
import Swal from 'sweetalert2';
import { GrupoService } from '../../../../core/services/grupo.service';
import { ClienteService } from '../../../../core/services/cliente.service';
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
  coordinadorName: string = 'Coordinador';
  coordinacionId: string = '';
  coordinacionNombre: string = 'Mi Coordinación';

  // Listas base
  grupos: any[] = [];
  clientes: any[] = [];
  asesoresList: any[] = [];

  // Filtros
  searchTerm: string = '';
  filtroAsesorId: string = 'todos';
  filtroEstado: string = 'todos';

  // Acordeón para inspeccionar detalles en solo lectura
  expandedItems: { [id: string]: boolean } = {};

  // Mapeos rápidos para créditos
  private creditoMiembroMap = new Map<string, any>();
  private creditoClienteMap = new Map<string, any>();

  constructor(
    @Inject(PLATFORM_ID) private platformId: Object,
    private grupoService: GrupoService,
    private clienteService: ClienteService,
    private router: Router,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    if (isPlatformBrowser(this.platformId)) {
      this.cargarDatosUsuario();
      this.cargarDatos();
    }
  }

  private cargarDatosUsuario(): void {
    const userStr = localStorage.getItem('user');
    if (userStr) {
      try {
        const userObj = JSON.parse(userStr);
        this.coordinadorName = userObj.nombre || userObj.username || 'Coordinador';
        const rawCoord = userObj.coordinacion;
        this.coordinacionId = (rawCoord && typeof rawCoord === 'object')
          ? String(rawCoord._id || rawCoord.id || '')
          : String(rawCoord || '');
      } catch (e) {
        console.error('Error parseando datos de usuario:', e);
      }
    }
  }

  cargarDatos(forceRefresh = false): void {
    this.isLoading = true;
    this.cdr.markForCheck();

    forkJoin({
      grupos: this.grupoService.getGrupos(forceRefresh),
      asesores: this.grupoService.getAsesores(forceRefresh),
      clientes: this.clienteService.getClientes({ conCredito: true }, forceRefresh),
      coordinaciones: this.grupoService.getCoordinaciones(forceRefresh),
      creditosRes: this.grupoService.getCreditos({}, forceRefresh),
      miembrosRes: this.grupoService.getMiembros(forceRefresh)
    }).subscribe({
      next: (res: any) => {
        const allCoordinaciones = res.coordinaciones || [];
        const allAsesores = res.asesores || [];
        const allGrupos = res.grupos || [];
        const allClientes = res.clientes || [];
        const allCreditos = res.creditosRes?.creditos || res.creditosRes || [];

        // 1. Obtener nombre de la coordinación
        if (this.coordinacionId) {
          const coordObj = allCoordinaciones.find((c: any) => String(c._id) === String(this.coordinacionId));
          if (coordObj && coordObj.nombre) {
            this.coordinacionNombre = coordObj.nombre;
          }
        }

        // 2. Filtrar asesores de su coordinación
        if (this.coordinacionId) {
          this.asesoresList = allAsesores.filter((a: any) => {
            const aCoord = (a.coordinacion && typeof a.coordinacion === 'object')
              ? (a.coordinacion._id || a.coordinacion.id)
              : a.coordinacion;
            return aCoord && String(aCoord) === String(this.coordinacionId);
          });
        } else {
          this.asesoresList = allAsesores;
        }

        // 3. Crear mapa de créditos
        this.creditoMiembroMap.clear();
        this.creditoClienteMap.clear();

        for (const c of allCreditos) {
          if (c.miembro) {
            const mId = typeof c.miembro === 'object' ? String(c.miembro._id || c.miembro.id) : String(c.miembro);
            if (!this.creditoMiembroMap.has(mId) || c.estado === 'Activo') {
              this.creditoMiembroMap.set(mId, c);
            }
          }
          if (c.cliente) {
            const clId = typeof c.cliente === 'object' ? String(c.cliente._id || c.cliente.id) : String(c.cliente);
            if (!this.creditoClienteMap.has(clId) || c.estado === 'Activo') {
              this.creditoClienteMap.set(clId, c);
            }
          }
        }

        // 4. Asignar créditos a integrantes de grupos para modo solo lectura
        this.grupos = allGrupos.map((g: any) => {
          const integrantesConCredito = (g.integrantes || []).map((m: any) => {
            const mId = String(m._id || m);
            const cred = this.creditoMiembroMap.get(mId) || null;
            return {
              ...m,
              credito: cred
            };
          });
          return {
            ...g,
            integrantes: integrantesConCredito
          };
        });

        // 5. Asignar créditos a clientes individuales
        this.clientes = allClientes.map((c: any) => {
          const clId = String(c._id);
          const cred = c.credito || this.creditoClienteMap.get(clId) || null;
          return {
            ...c,
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

  // --- FILTROS COMPUTADOS ---
  get gruposFiltrados(): any[] {
    let result = this.grupos;

    // Filtro por Asesor
    if (this.filtroAsesorId && this.filtroAsesorId !== 'todos') {
      result = result.filter(g => {
        const aId = (g.asesor && typeof g.asesor === 'object') ? (g.asesor._id || g.asesor.id) : g.asesor;
        return aId && String(aId) === String(this.filtroAsesorId);
      });
    }

    // Filtro por Estado
    if (this.filtroEstado && this.filtroEstado !== 'todos') {
      result = result.filter(g => g.estadoGrupo === this.filtroEstado);
    }

    // Búsqueda por texto (nombre, clave, asesor)
    if (this.searchTerm && this.searchTerm.trim()) {
      const term = this.searchTerm.toLowerCase().trim();
      result = result.filter(g => {
        const nombre = (g.nombre || '').toLowerCase();
        const clave = (g.clave || '').toLowerCase();
        const asesorNombre = typeof g.asesor === 'object' ? (g.asesor?.nombre || '').toLowerCase() : '';
        return nombre.includes(term) || clave.includes(term) || asesorNombre.includes(term);
      });
    }

    return result;
  }

  get clientesFiltrados(): any[] {
    let result = this.clientes;

    // Filtro por Asesor
    if (this.filtroAsesorId && this.filtroAsesorId !== 'todos') {
      result = result.filter(c => {
        const aId = (c.asesor && typeof c.asesor === 'object') ? (c.asesor._id || c.asesor.id) : c.asesor;
        return aId && String(aId) === String(this.filtroAsesorId);
      });
    }

    // Búsqueda por texto (nombre, clave, asesor)
    if (this.searchTerm && this.searchTerm.trim()) {
      const term = this.searchTerm.toLowerCase().trim();
      result = result.filter(c => {
        const nombre = (c.nombre || '').toLowerCase();
        const clave = (c.clave || '').toLowerCase();
        const asesorNombre = typeof c.asesor === 'object' ? (c.asesor?.nombre || '').toLowerCase() : '';
        return nombre.includes(term) || clave.includes(term) || asesorNombre.includes(term);
      });
    }

    return result;
  }

  setTab(tab: 'grupos' | 'individuales'): void {
    this.activeTab = tab;
  }

  setFiltroAsesor(asesorId: string): void {
    this.filtroAsesorId = asesorId;
  }

  limpiarFiltros(): void {
    this.searchTerm = '';
    this.filtroAsesorId = 'todos';
    this.filtroEstado = 'todos';
  }

  toggleAccordion(id: string): void {
    this.expandedItems[id] = !this.expandedItems[id];
  }

  irAAsesorHome(): void {
    this.router.navigate(['/home-asesor']);
  }

  // --- VISTA PREVIA HOJAS DE CONTROL (SOLO LECTURA) ---

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
              <option value="llena">Hoja Llena (con datos de crédito)</option>
              <option value="vacia">Hoja Vacía (en blanco)</option>
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
      window.open(url, '_blank');
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
              <option value="llena">Hoja Llena (con datos de crédito)</option>
              <option value="vacia">Hoja Vacía (en blanco)</option>
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
      window.open(url, '_blank');
    }
  }

  // --- MÉTODOS DE APOYO DE CICLOS Y SEMANAS ---

  getCicloActualGrupo(grupo: any): number {
    if (!grupo) return 1;
    let maxCiclo = Number(grupo.cicloActual) || 0;
    if (grupo.integrantes && Array.isArray(grupo.integrantes)) {
      for (const m of grupo.integrantes) {
        const cred = m.credito;
        if (cred) {
          const cCiclo = Number(cred.ciclo) || 0;
          if (cred.estado === 'Activo' && cCiclo > 0) return cCiclo;
          if (cCiclo > maxCiclo) maxCiclo = cCiclo;
        }
      }
    }
    return maxCiclo > 0 ? maxCiclo : 1;
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
