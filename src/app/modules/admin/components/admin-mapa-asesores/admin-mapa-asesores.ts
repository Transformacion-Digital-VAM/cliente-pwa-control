import { Component, OnInit, AfterViewInit, Inject, PLATFORM_ID, ChangeDetectorRef, ViewEncapsulation } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { LocationService, UserLocation } from '../../../../core/services/location.service';
import { GrupoService } from '../../../../core/services/grupo.service';

@Component({
  selector: 'app-admin-mapa-asesores',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './admin-mapa-asesores.html',
  styleUrl: './admin-mapa-asesores.css',
  encapsulation: ViewEncapsulation.None
})
export class AdminMapaAsesores implements OnInit, AfterViewInit {
  private map: any;
  asesoresLocations: UserLocation[] = [];
  L: any;
  cargando: boolean = true;
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
    }
  }

  ngAfterViewInit(): void {
    if (isPlatformBrowser(this.platformId)) {
      import('leaflet').then(leaflet => {
        // En algunos entornos el objeto se encuentra en el .default
        this.L = (leaflet as any).default || leaflet;
        this.initMap();
        this.addMarkersToMap();
      });
    }
  }

  private initMap(): void {
    // Solo inicializar si no se ha inicializado
    if (this.map) return;

    this.map = this.L.map('map').setView([19.4326, -99.1332], 10);

    this.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 18,
      attribution: '© OpenStreetMap contributors'
    }).addTo(this.map);
  }

  private cargarAsesores(): void {
    this.cargando = true;
    this.grupoService.getAsesores().subscribe({
      next: (response: any) => {
        const asesores = response || response.asesores || [];
        this.locationService.getAdvisorsLocations(asesores).subscribe((locations: UserLocation[]) => {
          this.asesoresLocations = locations;
          this.cargando = false;
          if (this.map && this.L) {
            this.addMarkersToMap();
          }
          this.cdr.detectChanges();
        });
      },
      error: (err: any) => {
        console.error('Error al cargar asesores:', err);
        this.errorMsg = 'Error al cargar ubicaciones.';
        this.cargando = false;
        this.cdr.detectChanges();
      }
    });
  }

  // private addMarkersToMap(): void {
  //   if (!this.map || !this.L || this.asesoresLocations.length === 0) return;

  //   // Default Leaflet icon configuration
  //   const defaultIcon = this.L.icon({
  //     iconUrl: 'assets/marker-icon.png',
  //     // shadowUrl: 'assets/marker-shadow.png',
  //     iconSize: [25, 41],
  //     iconAnchor: [12, 41],
  //     popupAnchor: [1, -34],
  //     shadowSize: [41, 41]
  //   });

  //   this.L.Marker.prototype.options.icon = defaultIcon;

  //   const bounds = this.L.latLngBounds();

  //   this.asesoresLocations.forEach(loc => {
  //     const marker = this.L.marker([loc.lat, loc.lng])
  //       .bindPopup(`<b>${loc.username}</b><br>Última actualización: ${loc.timestamp.toLocaleTimeString()}`)
  //       .addTo(this.map);

  //     bounds.extend([loc.lat, loc.lng]);
  //   });

  //   if (this.asesoresLocations.length > 0) {
  //     this.map.fitBounds(bounds, { padding: [50, 50] });
  //   }
  // }
  private addMarkersToMap(): void {
    if (!this.map || !this.L || this.asesoresLocations.length === 0) return;

    // Limpiar marcadores previos si es necesario
    // this.map.eachLayer((layer: any) => { if (layer instanceof this.L.Marker) this.map.removeLayer(layer); });

    const bounds = this.L.latLngBounds();

    this.asesoresLocations.forEach(loc => {
      // Definimos el icono personalizado usando HTML
      const customIcon = this.L.divIcon({
        className: 'custom-leaflet-marker',
        html: `
        <div class="marker-pin-wrapper">
          <div class="marker-circle" style="display: flex; align-items: center; justify-content: center; background-color: white;">
            <img src="assets/marker-icon.avif" style="max-width: 80%; max-height: 80%; object-fit: contain;">
          </div>
          <div class="marker-arrow"></div>
          <p class="text-center text-blue-600 font-bold">${loc.username}</p>
        </div>
      `,
        iconSize: [54, 65],   // Tamaño total del diseño
        iconAnchor: [27, 65], // La punta (mitad del ancho, total del alto)
        popupAnchor: [0, -65] // El popup aparece arriba del círculo
      });

      const marker = this.L.marker([loc.lat, loc.lng], { icon: customIcon })
        .bindPopup(`
        <div class="text-center">
          <strong class="text-blue-600">${loc.username}</strong><br>
          <span class="text-xs text-slate-500">Actualizado: ${loc.timestamp.toLocaleTimeString()}</span>
        </div>
      `)
        .addTo(this.map);

      bounds.extend([loc.lat, loc.lng]);
    });

    if (this.asesoresLocations.length > 0) {
      this.map.fitBounds(bounds, { padding: [50, 50] });
    }
  }
}
