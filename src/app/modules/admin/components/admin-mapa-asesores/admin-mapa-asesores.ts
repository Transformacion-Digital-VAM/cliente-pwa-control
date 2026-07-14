import { Component, OnInit, AfterViewInit, Inject, PLATFORM_ID, ChangeDetectorRef, ViewEncapsulation } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LocationService, UserLocation } from '../../../../core/services/location.service';
import { GrupoService } from '../../../../core/services/grupo.service';
import { UppercaseDirective } from '../../uppercase.directive';

type MapTab = 'asesores' | 'pagos';

@Component({
  selector: 'app-admin-mapa-asesores',
  standalone: true,
  imports: [CommonModule, FormsModule, UppercaseDirective],
  templateUrl: './admin-mapa-asesores.html',
  styleUrl: './admin-mapa-asesores.css',
  encapsulation: ViewEncapsulation.None
})
export class AdminMapaAsesores implements OnInit, AfterViewInit {
  private map: any;
  private pagoMap: any;

  // --- ASESORES ACTIVOS ---
  asesoresLocations: UserLocation[] = [];
  branches: { name: string, locations: UserLocation[], mapInstance: any }[] = [];
  coordinacionActiva: string = '';
  asesorBusqueda: string = '';

  // --- PAGOS CON UBICACIÓN ---
  todosPagos: any[] = [];
  pagosFiltrados: any[] = [];
  filtroAsesor: string = '';
  filtroGrupo: string = '';
  filtroFecha: string = '';
  filtroCoordinacion: string = '';         // '' = todas las coordinaciones
  asesorCoordMap: { [username: string]: string } = {}; // username -> nombre de coordinación
  asesoresUnicos: string[] = [];
  gruposUnicos: string[] = [];

  // Paginación
  paginaActual: number = 1;
  porPagina: number = 15;

  // --- ESTADO ---
  L: any;
  tabActual: MapTab = 'asesores';
  cargandoAsesores: boolean = true;
  cargandoPagos: boolean = true;
  errorMsg: string = '';

  constructor(
    private locationService: LocationService,
    private grupoService: GrupoService,
    private cdr: ChangeDetectorRef,
    @Inject(PLATFORM_ID) private platformId: Object
  ) { }

  ngOnInit(): void {
    if (isPlatformBrowser(this.platformId)) {
      this.cargarAsesores();
      this.cargarPagosConUbicacion();
    }
  }

  ngAfterViewInit(): void {
    if (isPlatformBrowser(this.platformId)) {
      import('leaflet').then(leaflet => {
        this.L = (leaflet as any).default || leaflet;
        this.initMaps();
        this.addMarkersToMaps();
      });
    }
  }

  // -------------------------------------------------------
  // TABS
  // -------------------------------------------------------
  cambiarTab(tab: MapTab): void {
    this.tabActual = tab;
    this.cdr.detectChanges();

    if (tab === 'pagos' && this.L) {
      setTimeout(() => this.initPagoMap(), 150);
    } else if (tab === 'asesores' && this.L) {
      setTimeout(() => { this.initMaps(); this.addMarkersToMaps(); }, 150);
    }
  }

  // -------------------------------------------------------
  // ASESORES ACTIVOS
  // -------------------------------------------------------
  private initMaps(): void {
    if (!this.L) return;
    this.branches.forEach((branch, index) => {
      if (branch.mapInstance) return;
      const mapId = 'map-' + index;
      const mapElement = document.getElementById(mapId);
      if (!mapElement) return;
      branch.mapInstance = this.L.map(mapId).setView([19.4326, -99.1332], 10);
      this.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 18,
        attribution: '© OpenStreetMap'
      }).addTo(branch.mapInstance);
    });
  }

  private cargarAsesores(): void {
    const userRole = localStorage.getItem('userRole') || '';
    const userStr = localStorage.getItem('user');
    let userCoordinacion = '';
    if (userStr) {
      try {
        const u = JSON.parse(userStr);
        userCoordinacion = u.coordinacion || '';
      } catch (e) {}
    }

    this.cargandoAsesores = true;
    this.grupoService.getAsesores().subscribe({
      next: (response: any) => {
        const allAsesores = response || response.asesores || [];
        let asesores = allAsesores;
        if ((userRole === 'master' || userRole === 'superadmin' || userRole === 'coordinador' || userRole === 'ejecutiva') && userCoordinacion) {
          asesores = allAsesores.filter((a: any) => {
            const aCoord = a.coordinacion;
            const aCoordId = (aCoord && typeof aCoord === 'object') ? (aCoord._id || aCoord.id) : aCoord;
            return aCoordId && String(aCoordId) === String(userCoordinacion);
          });
        }
        this.locationService.getAdvisorsLocations(asesores).subscribe((locations: UserLocation[]) => {
          this.asesoresLocations = locations;
          const grouped: { [key: string]: UserLocation[] } = {};
          this.asesoresLocations.forEach(loc => {
            const branchName = loc.coordinacion || 'Sin Sucursal';
            if (!grouped[branchName]) grouped[branchName] = [];
            grouped[branchName].push(loc);
          });
          this.branches = Object.keys(grouped).map(name => ({ name, locations: grouped[name], mapInstance: null }));
          // Seleccionar la primera coordinación por defecto
          if (this.branches.length > 0 && !this.coordinacionActiva) {
            this.coordinacionActiva = this.branches[0].name;
          }
          // Construir mapa username -> nombre de coordinación (para filtrar pagos)
          this.asesorCoordMap = {};
          this.asesoresLocations.forEach(loc => {
            this.asesorCoordMap[loc.username] = loc.coordinacion || 'Sin Coordinación';
          });
          this.cargandoAsesores = false;
          this.cdr.detectChanges();
          if (this.L) {
            setTimeout(() => { this.initMaps(); this.addMarkersToMaps(); }, 100);
          }
        });
      },
      error: (err: any) => {
        console.error('Error al cargar asesores:', err);
        this.errorMsg = 'Error al cargar ubicaciones de asesores.';
        this.cargandoAsesores = false;
        this.cdr.detectChanges();
      }
    });
  }

  private addMarkersToMaps(): void {
    if (!this.L) return;
    this.branches.forEach((branch) => {
      if (!branch.mapInstance || branch.locations.length === 0) return;
      const bounds = this.L.latLngBounds();
      branch.locations.forEach(loc => {
        const customIcon = this.L.divIcon({
          className: 'custom-leaflet-marker',
          html: `
          <div class="marker-pin-wrapper">
            <div class="marker-circle" style="display: flex; align-items: center; justify-content: center; background-color: white;">
              <img src="assets/marker-icon.avif" style="max-width: 80%; max-height: 80%; object-fit: contain;">
            </div>
            <div class="marker-arrow"></div>
            <p class="text-center text-blue-600 font-bold">${loc.nombre || loc.username}</p>
          </div>`,
          iconSize: [54, 65], iconAnchor: [27, 65], popupAnchor: [0, -65]
        });
        this.L.marker([loc.lat, loc.lng], { icon: customIcon })
          .bindPopup(`<div class="text-center"><strong class="text-blue-600">${loc.nombre || loc.username}</strong><br><span class="text-xs text-slate-500">Actualizado: ${loc.timestamp.toLocaleTimeString()}</span></div>`)
          .addTo(branch.mapInstance);
        bounds.extend([loc.lat, loc.lng]);
      });
      if (branch.locations.length > 0) {
        branch.mapInstance.fitBounds(bounds, { padding: [50, 50] });
      }
    });
  }

  // -------------------------------------------------------
  // PAGOS CON UBICACIÓN
  // -------------------------------------------------------
  private cargarPagosConUbicacion(): void {
    this.cargandoPagos = true;
    this.grupoService.getPagosConUbicacion().subscribe({
      next: (res: any) => {
        this.todosPagos = res.puntos || [];
        // Listas únicas para filtros
        this.asesoresUnicos = [...new Set(this.todosPagos.map((p: any) => p.asesor).filter(Boolean))].sort();
        this.gruposUnicos = [...new Set(this.todosPagos.map((p: any) => p.grupo).filter(Boolean))].sort();
        this.aplicarFiltros();
        this.cargandoPagos = false;
        this.cdr.detectChanges();
      },
      error: (err: any) => {
        console.error('Error al cargar pagos con ubicación:', err);
        this.cargandoPagos = false;
        this.cdr.detectChanges();
      }
    });
  }

  aplicarFiltros(): void {
    this.paginaActual = 1;
    this.pagosFiltrados = this.todosPagos.filter(p => {
      const okAsesor = !this.filtroAsesor || (p.asesor || '').toLowerCase().includes(this.filtroAsesor.toLowerCase());
      const okGrupo = !this.filtroGrupo || (p.grupo || '').toLowerCase().includes(this.filtroGrupo.toLowerCase());
      const okFecha = !this.filtroFecha || (p.fechaPago && p.fechaPago.startsWith(this.filtroFecha));
      const coordPago = this.asesorCoordMap[p.asesor || ''] || 'Sin Coordinación';
      const okCoord = !this.filtroCoordinacion || coordPago === this.filtroCoordinacion;
      return okAsesor && okGrupo && okFecha && okCoord;
    });

    // Actualizar mapa de pagos si está visible
    if (this.tabActual === 'pagos' && this.L) {
      setTimeout(() => this.initPagoMap(), 100);
    }
  }

  limpiarFiltros(): void {
    this.filtroAsesor = '';
    this.filtroGrupo = '';
    this.filtroFecha = '';
    this.filtroCoordinacion = '';
    this.aplicarFiltros();
  }

  /** Selecciona la pestaña de coordinación en el tab de asesores */
  /** Coordinaciones únicas presentes en los pagos (basado en el mapa asesor->coord) */
  get coordinacionesPagos(): string[] {
    const set = new Set<string>();
    this.todosPagos.forEach(p => {
      const coord = this.asesorCoordMap[p.asesor || ''] || 'Sin Coordinación';
      set.add(coord);
    });
    return Array.from(set).sort();
  }

  /** Cuántos pagos en todosPagos pertenecen a la coordinación indicada */
  getCountPagosByCoord(coordNombre: string): number {
    return this.todosPagos.filter(p => {
      const coord = this.asesorCoordMap[p.asesor || ''] || 'Sin Coordinación';
      return coord === coordNombre;
    }).length;
  }

  seleccionarCoordinacion(nombre: string): void {
    this.coordinacionActiva = nombre;
    this.asesorBusqueda = '';
    this.cdr.detectChanges();
    if (this.L) {
      setTimeout(() => { this.initMaps(); this.addMarkersToMaps(); }, 150);
    }
  }

  /** Branch actualmente seleccionada */
  get branchActiva(): { name: string, locations: UserLocation[], mapInstance: any } | undefined {
    return this.branches.find(b => b.name === this.coordinacionActiva);
  }

  /** Asesores de la branch activa filtrados por el buscador de texto */
  get asesoresFiltradosDeBranch(): UserLocation[] {
    const branch = this.branchActiva;
    if (!branch) return [];
    if (!this.asesorBusqueda.trim()) return branch.locations;
    const term = this.asesorBusqueda.toLowerCase().trim();
    return branch.locations.filter(l => (l.nombre || l.username || '').toLowerCase().includes(term));
  }

  private initPagoMap(): void {
    if (!this.L) return;

    const el = document.getElementById('pago-map');
    if (!el) return;

    // Destruir mapa anterior si existe
    if (this.pagoMap) {
      this.pagoMap.remove();
      this.pagoMap = null;
    }

    this.pagoMap = this.L.map('pago-map').setView([19.4326, -99.1332], 8);
    this.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© OpenStreetMap'
    }).addTo(this.pagoMap);

    const bounds = this.L.latLngBounds();
    let hasPoints = false;

    this.pagosFiltrados.forEach(p => {
      const lat = p.ubicacion?.latitud;
      const lng = p.ubicacion?.longitud;
      if (!lat || !lng) return;

      const monto = (p.montoPagado || 0) + (p.montoSolidario || 0);
      const fecha = p.fechaPago ? new Date(p.fechaPago).toLocaleDateString('es-MX') : '—';

      const icon = this.L.divIcon({
        className: '',
        html: `<div style="
          background: #1d4ed8;
          color: white;
          border-radius: 50%;
          width: 32px;
          height: 32px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 11px;
          font-weight: 800;
          border: 2px solid white;
          box-shadow: 0 2px 6px rgba(0,0,0,0.35);
          cursor: pointer;
        ">$</div>`,
        iconSize: [32, 32],
        iconAnchor: [16, 16],
        popupAnchor: [0, -18]
      });

      this.L.marker([lat, lng], { icon })
        .bindPopup(`
          <div style="min-width:180px; font-family: sans-serif; font-size: 13px;">
            <div style="font-weight:800; color:#1d4ed8; margin-bottom:4px;">${p.persona}</div>
            <div><b>Grupo:</b> ${p.grupo || '—'}</div>
            <div><b>Asesor:</b> ${p.asesor || '—'}</div>
            <div><b>Monto:</b> $${monto.toFixed(2)}</div>
            <div><b>Recibo #:</b> ${p.numeroRecibo || '—'}</div>
            <div><b>Fecha:</b> ${fecha}</div>
            <div><b>Método:</b> ${p.metodoPago || '—'}</div>
            <div style="color:#64748b; font-size:11px; margin-top:4px;">${lat.toFixed(6)}, ${lng.toFixed(6)}</div>
          </div>
        `)
        .addTo(this.pagoMap);

      bounds.extend([lat, lng]);
      hasPoints = true;
    });

    if (hasPoints) {
      this.pagoMap.fitBounds(bounds, { padding: [40, 40] });
    }
  }

  // -------------------------------------------------------
  // AGRUPACIÓN POR GRUPO
  // -------------------------------------------------------
  /**
   * Agrupa pagosFiltrados por (grupo + día). Los pagos sin grupo
   * se muestran como filas individuales.
   */
  get pagosFiltradosAgrupados(): any[] {
    const map = new Map<string, any>();

    this.pagosFiltrados.forEach(p => {
      const fecha = p.fechaPago ? p.fechaPago.substring(0, 10) : '';
      const grupoNombre = p.grupo || '';
      const key = grupoNombre
        ? `GRUPO||${grupoNombre}||${fecha}`
        : `IND||${p.persona}||${fecha}`;

      if (!map.has(key)) {
        map.set(key, {
          esGrupo: !!grupoNombre,
          grupo: grupoNombre || '—',
          persona: grupoNombre || p.persona,
          asesor: p.asesor,
          fechaPago: p.fechaPago,
          totalMonto: 0,
          count: 0,
          metodoPago: p.metodoPago,
          ubicacion: p.ubicacion,
          _pagosOriginales: []
        });
      }

      const entry = map.get(key)!;
      entry.totalMonto += (p.montoPagado || 0) + (p.montoSolidario || 0);
      entry.count += 1;
      entry._pagosOriginales.push(p);

      // Usar la última ubicación disponible del grupo
      if (p.ubicacion?.latitud && p.ubicacion?.longitud) {
        entry.ubicacion = p.ubicacion;
      }
      // Si los métodos difieren, marcar como MIXTO
      if (entry.count > 1 && entry.metodoPago !== p.metodoPago) {
        entry.metodoPago = 'MIXTO';
      }
    });

    return Array.from(map.values()).sort((a, b) =>
      new Date(b.fechaPago).getTime() - new Date(a.fechaPago).getTime()
    );
  }

  // -------------------------------------------------------
  // PAGINACIÓN
  // -------------------------------------------------------
  get totalPaginas(): number {
    return Math.ceil(this.pagosFiltradosAgrupados.length / this.porPagina);
  }

  get paginasPagos(): any[] {
    const inicio = (this.paginaActual - 1) * this.porPagina;
    return this.pagosFiltradosAgrupados.slice(inicio, inicio + this.porPagina);
  }

  get pageNumbers(): number[] {
    return Array.from({ length: this.totalPaginas }, (_, i) => i + 1);
  }

  irAPagina(n: number): void {
    if (n >= 1 && n <= this.totalPaginas) this.paginaActual = n;
  }

  // -------------------------------------------------------
  // HELPERS
  // -------------------------------------------------------
  formatFecha(iso: string): string {
    if (!iso) return '—';
    const d = new Date(iso);
    return d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  montoPago(p: any): number {
    return (p.montoPagado || 0) + (p.montoSolidario || 0);
  }

  verEnMapa(p: any): void {
    if (!this.pagoMap || !p.ubicacion?.latitud) return;
    this.pagoMap.setView([p.ubicacion.latitud, p.ubicacion.longitud], 16);
    this.pagoMap.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const el = document.getElementById('pago-map');
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}
