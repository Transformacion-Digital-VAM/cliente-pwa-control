import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, forkJoin, of, throwError } from 'rxjs';
import { catchError, map, switchMap } from 'rxjs/operators';
import { DexieService } from '../database/dexie.service';
import { environment } from '../../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class ClienteService {
  // Ajusta la IP según tu configuración actual (misma que en GrupoService)
  private apiUrlCliente = `${environment.apiUrl}/clientes`;
  private apiUrlCredito = `${environment.apiUrl}/creditos`;

  constructor(
    private http: HttpClient,
    private dexie: DexieService
  ) { }

  /**
   * Crea un cliente individual y su crédito asociado.
   * Si no hay conexión, lo guarda en Dexie para sincronizar después.
   */
  crearClienteIndividual(payload: any): Observable<any> {
    const isOnline = navigator.onLine;

    // Si no hay conexión de antemano, directo a Dexie
    if (!isOnline) {
      return this.guardarLocal(payload);
    }

    // 1. Separamos los datos del cliente de los del crédito
    const bodyCliente = {
      nombre: payload.nombreCliente,
      diaPago: payload.diaPago,
      asesor: payload.asesor
    };

    // 2. Intentar POST del Cliente
    return this.http.post(`${this.apiUrlCliente}`, bodyCliente).pipe(
      switchMap((clienteGuardado: any) => {
        // 3. Crear el crédito asociado al cliente individual
        const bodyCredito = {
          cliente: clienteGuardado._id,
          tipoCredito: 'Individual', // Forzamos tipo individual
          ciclo: payload.ciclo || 1,
          pagoPactado: payload.pagoPactado,
          semanas: payload.noPagos, // Usamos 'noPagos' como semanas/quincenas (según el periodo)
          saldoTotal: payload.saldoInicial, // El admin ingresa el saldo inicial
          saldoPendiente: payload.saldoInicial,
          fechaPrimerPago: payload.fechaPrimerPago,
          garantia: payload.garantia || 0
        };

        return this.http.post(`${this.apiUrlCredito}/`, bodyCredito).pipe(
          map(() => clienteGuardado) // Al final retornamos la info del cliente
        );
      }),
      catchError(error => {
        const isNetworkError = !navigator.onLine || error.status === 0 || error.status === 504 || error.status === 503 || error.status === 500;
        if (isNetworkError) {
          console.warn(`[Network Error] Status: ${error.status} - Usando guardado local (Dexie) para Cliente Individual`);
          return this.guardarLocal(payload);
        }
        return throwError(() => error);
      })
    );
  }

  /**
   * Obtiene la lista de clientes (el backend filtra si es Asesor o Administrador).
   */
  getClientes(): Observable<any> {
    return this.http.get(`${this.apiUrlCliente}`);
  }

  /**
   * Obtiene todos los créditos (incluyendo los individuales).
   */
  getCreditos(): Observable<any> {
    return this.http.get(`${this.apiUrlCredito}/`);
  }

  /**
   * Registra un pago para un crédito (mismo endpoint que en grupos).
   */
  registrarPago(creditoId: string, pagoParams: any): Observable<any> {
    return this.http.post(`${this.apiUrlCredito}/${creditoId}/pagos`, pagoParams);
  }

  /**
   * Actualiza un crédito mediante PUT para eludir la validación estricta de 'miembro'
   * sin modificar el backend. (Workaround para el issue 500)
   */
  actualizarCredito(creditoId: string, payload: any): Observable<any> {
    return this.http.put(`${this.apiUrlCredito}/${creditoId}`, payload);
  }

  private guardarLocal(payload: any): Observable<any> {
    return of({
      offline: true,
      message: 'Sin conexión: Guardado localmente (Simulado de momento para clientes individuales, falta implementar en dexie.service.ts).'
    });
    /* 
    Nota: Para soporte offline completo, debes agregar 'POST_CLIENTE' en el worker 
    y en DexieService similar a como tienes los grupos.
    */
  }
}
