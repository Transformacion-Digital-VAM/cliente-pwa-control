import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import Swal from 'sweetalert2';
import { environment } from '../../../environments/environment';

export interface UserLocation {
  userId: string;
  username: string;
  lat: number;
  lng: number;
  timestamp: Date;
}

@Injectable({
  providedIn: 'root'
})
export class LocationService {
  private apiUrl = `${environment.apiUrl}/users/location`;

  constructor(private http: HttpClient) { }

  // Función para obtener la ubicación actual del asesor
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
          this.http.post(this.apiUrl, coords).subscribe();
          Swal.fire({
            icon: 'success',
            title: '¡Ubicación compartida!',
            text: 'Tu posición se ha recibido correctamente.',
            timer: 2000,
            showConfirmButton: false
          });
          resolve();
        },
        (error) => {
          console.error('Error al obtener ubicación', error);
          let errorMsg = 'No pudimos obtener tu ubicación.';
          if (error.code === error.PERMISSION_DENIED) {
            errorMsg = 'Debes permitir el acceso a tu ubicación en el navegador (popup superior) para poder compartirla.';
          }
          Swal.fire('Atención', errorMsg, 'warning');
          reject(error);
        },
        { enableHighAccuracy: true }
      );
    });
  }

  // Obtener las ubicaciones de todos los asesores.
  getAdvisorsLocations(asesoresList: any[]): Observable<UserLocation[]> {
    const realLocations: UserLocation[] = asesoresList
      .filter((asesor) => asesor.lastLocation && asesor.lastLocation.lat && asesor.lastLocation.lng)
      .map((asesor) => {
        return {
          userId: asesor._id,
          username: asesor.username,
          lat: asesor.lastLocation.lat,
          lng: asesor.lastLocation.lng,
          timestamp: new Date(asesor.lastLocation.timestamp)
        };
      });

    return of(realLocations);
  }
}
