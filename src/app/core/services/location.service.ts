import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import Swal from 'sweetalert2';
import { environment } from '../../../environments/environment';

export interface UserLocation {
  userId: string;
  username: string;
  coordinacion: string;
  lat: number;
  lng: number;
  timestamp: Date;
}

export interface PaymentCoords {
  latitud: number;
  longitud: number;
}

@Injectable({
  providedIn: 'root'
})
export class LocationService {
  private apiUrl = `${environment.apiUrl}/users/location`;

  /** Última ubicación conocida, actualizada en segundo plano */
  private cachedCoords: PaymentCoords | null = null;
  private watchId: number | null = null;

  constructor(private http: HttpClient) { }

  /**
   * Llama esto UNA VEZ al arrancar la app (desde app.ts).
   * Pide permiso al SO y activa watchPosition para mantener
   * las coords actualizadas silenciosamente en memoria.
   */
  initGeolocation(): void {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return;

    // Warm-up: obtener posición inicial rápida
    navigator.geolocation.getCurrentPosition(
      (pos) => { this.cachedCoords = { latitud: pos.coords.latitude, longitud: pos.coords.longitude }; },
      (err) => { console.warn('[LocationService] Permiso de GPS denegado o error:', err.message); },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
    );

    // Mantener coords actualizadas de forma continua
    this.watchId = navigator.geolocation.watchPosition(
      (pos) => { this.cachedCoords = { latitud: pos.coords.latitude, longitud: pos.coords.longitude }; },
      (err) => { console.warn('[LocationService] watchPosition error:', err.message); },
      { enableHighAccuracy: true, maximumAge: 60000, timeout: 15000 }
    );
  }

  /**
   * Retorna las coords cacheadas de forma SÍNCRONA (sin prompts).
   * Si no hay coords disponibles, retorna null.
   */
  getCurrentCoords(): PaymentCoords | null {
    return this.cachedCoords;
  }

  /**
   * Retorna las coords de forma ASÍNCRONA.
   * Si el caché ya tiene datos, los retorna inmediatamente.
   * Si no, intenta obtener posición GPS con un timeout de 8 segundos.
   * Si falla o el usuario deniega, retorna null (el pago se guarda sin ubicación).
   */
  getCoordsFresh(): Promise<PaymentCoords | null> {
    // Si ya tenemos coords en caché, úsalas de inmediato
    if (this.cachedCoords) {
      return Promise.resolve(this.cachedCoords);
    }

    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      return Promise.resolve(null);
    }

    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          this.cachedCoords = { latitud: pos.coords.latitude, longitud: pos.coords.longitude };
          resolve(this.cachedCoords);
        },
        (err) => {
          console.warn('[LocationService] getCoordsFresh falló:', err.message);
          resolve(null); // No bloqueamos el pago, simplemente va sin coords
        },
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 }
      );
    });
  }

  /**
   * Detener el watchPosition (para limpiar recursos si fuera necesario).
   */
  stopWatching(): void {
    if (this.watchId !== null && typeof navigator !== 'undefined') {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
    }
  }

  // -----------------------------------------------------------------------
  // Función original: enviar la ubicación actual del asesor al servidor
  // -----------------------------------------------------------------------
  sendCurrentLocation(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        Swal.fire('Error', 'Geolocalización no soportada por el navegador.', 'error');
        return reject('No soportado');
      }

      navigator.geolocation.getCurrentPosition(
        (position) => {
          const coords = {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
            timestamp: new Date()
          };
          // Actualizar caché también
          this.cachedCoords = { latitud: coords.lat, longitud: coords.lng };
          this.http.post(this.apiUrl, coords).subscribe();
          resolve();
        },
        (error) => {
          console.error('[LocationService] Error al obtener ubicación:', error);
          let errorMsg = 'No pudimos obtener tu ubicación.';
          if (error.code === error.PERMISSION_DENIED) {
            errorMsg = 'Permite el acceso a la ubicación para sincronizar los datos locales.';
          }
          Swal.fire('Atención', errorMsg, 'warning');
          reject(error);
        },
        { enableHighAccuracy: true }
      );
    });
  }

  // -----------------------------------------------------------------------
  // Obtener las ubicaciones de todos los asesores (para el mapa del admin)
  // -----------------------------------------------------------------------
  getAdvisorsLocations(asesoresList: any[]): Observable<UserLocation[]> {
    const realLocations: UserLocation[] = asesoresList
      .filter((asesor) => asesor.lastLocation && asesor.lastLocation.lat && asesor.lastLocation.lng)
      .map((asesor) => ({
        userId: asesor._id,
        username: asesor.username,
        coordinacion: asesor.coordinacion?.nombre || 'Sin sucursal',
        lat: asesor.lastLocation.lat,
        lng: asesor.lastLocation.lng,
        timestamp: new Date(asesor.lastLocation.timestamp)
      }));

    return of(realLocations);
  }
}
