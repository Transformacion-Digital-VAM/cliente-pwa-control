import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, forkJoin, of, throwError, from } from 'rxjs';
import { catchError, map, switchMap } from 'rxjs/operators';
import { DexieService } from '../database/dexie.service';
import { environment } from '../../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class ClienteService {
  // Ruta desde environment.ts
  private apiUrlCliente = `${environment.apiUrl}/clientes`;
  private apiUrlCredito = `${environment.apiUrl}/creditos`;

  constructor(
    private http: HttpClient,
    private dexie: DexieService
  ) { }

  /**
   * Crear un cliente individual y su crédito asociado.
   * Si no hay conexión, lo guarda en Dexie para sincronizar después.
   */
  crearClienteIndividual(payload: any): Observable<any> {
    const isOnline = navigator.onLine;

    // Si no hay conexión de antemano, directo a Dexie
    if (!isOnline) {
      return this.guardarLocal(payload);
    }

    // 1. Separar datos del cliente de los datos del credito (diferentes colecciones)
    const bodyCliente = {
      nombre: payload.nombreCliente,
      diaPago: payload.diaPago,
      tipoPago: payload.tipoPago,
      grupo: payload.nombreGrupo || '',
      asesor: payload.asesor
    };

    // 2. Intento de Post del cliente
    return this.http.post(`${this.apiUrlCliente}`, bodyCliente).pipe(
      switchMap((clienteGuardado: any) => {
        // 3. Crear el crédito asociado al cliente individual
        const bodyCredito = {
          cliente: clienteGuardado._id,
          tipoCredito: 'Individual', // Forzamos tipo individual 
          ciclo: payload.ciclo || 1,
          pagoPactado: payload.pagoPactado,
          semanas: payload.noPagos, // Usamos 'noPagos' como semanas/quincenas (según el periodo)
          saldoTotal: payload.saldoInicial, // El admin ingresa el montoSolicitado
          saldoPendiente: payload.saldoInicial,
          fechaPrimerPago: payload.fechaPrimerPago,
          garantia: payload.garantia || 0,
          montoSolicitado: payload.montoSolicitado,
          tasaInteres: payload.tasaInteres,
          equivalenciaMeses: payload.equivalenciaMeses,
          garantiaPredial: payload.garantiaPredial,
          grupoOpcional: payload.nombreGrupo,
          frecuenciaPago: payload.tipoPago
        };

        return this.http.post(`${this.apiUrlCredito}/`, bodyCredito).pipe(
          map(() => clienteGuardado) // Al final se retorna la info del cliente
        );
      }),
      catchError(error => {
        const isNetworkError = !navigator.onLine || error.status === 0 || error.status === 504 || error.status === 503;
        if (isNetworkError) {
          console.warn(`[Network Error] Status: ${error.status} - Usando guardado local (Dexie) para Cliente Individual`);
          return this.guardarLocal(payload);
        }
        return throwError(() => error);
      })
    );
  }

  /**
   * Obtiene la lista de clientes 
   * (el backend filtra el user logueado si es Asesor o Admin).
   */
  getClientes(): Observable<any> {
    return this.http.get(`${this.apiUrlCliente}`).pipe(
      map((clientes: any) => {
        // Guardar en Dexie para uso offline
        if (Array.isArray(clientes)) {
          this.dexie.table('clientes').clear().then(() => {
            this.dexie.table('clientes').bulkAdd(clientes);
          });
        }
        return clientes;
      }),
      catchError(error => {
        if (!navigator.onLine || error.status === 0) {
          return from(this.dexie.table('clientes').toArray());
        }
        return throwError(() => error);
      })
    );
  }


  /**
   * Obtiene todos los créditos (incluyendo los individuales).
   */
  getCreditos(): Observable<any> {
    return this.http.get(`${this.apiUrlCredito}/`).pipe(
      map((res: any) => {
        const creditos = res.creditos || res || [];
        if (Array.isArray(creditos)) {
          this.dexie.table('creditos').clear().then(() => {
            this.dexie.table('creditos').bulkAdd(creditos);
          });
        }
        return res;
      }),
      catchError(error => {
        if (!navigator.onLine || error.status === 0) {
          return from(this.dexie.table('creditos').toArray()).pipe(
            map(creditos => ({ creditos })) // Envolver en objeto para mantener compatibilidad
          );
        }
        return throwError(() => error);
      })
    );
  }

  /**
   * Registra un pago para un crédito (mismo endpoint que en grupos).
   */
  registrarPago(creditoId: string, pagoParams: any): Observable<any> {
    const isOnline = navigator.onLine;
    if (!isOnline) {
      return this.guardarPagoLocal(creditoId, pagoParams);
    }

    return this.http.post(`${this.apiUrlCredito}/${creditoId}/pagos`, pagoParams).pipe(
      catchError(error => {
        if (!navigator.onLine || error.status === 0) {
          return this.guardarPagoLocal(creditoId, pagoParams);
        }
        return throwError(() => error);
      })
    );
  }

  /**
   * Actualiza un crédito mediante PUT
   */
  actualizarCredito(creditoId: string, payload: any): Observable<any> {
    const isOnline = navigator.onLine;
    if (!isOnline) {
      return this.guardarUpdateCreditoLocal(creditoId, payload);
    }

    return this.http.put(`${this.apiUrlCredito}/${creditoId}`, payload).pipe(
      catchError(error => {
        if (!navigator.onLine || error.status === 0) {
          return this.guardarUpdateCreditoLocal(creditoId, payload);
        }
        return throwError(() => error);
      })
    );
  }

  private guardarPagoLocal(creditoId: string, pagoParams: any): Observable<any> {
    return from(
      this.dexie.syncQueue.add({
        type: 'POST_PAGO',
        data: { creditoId, pagoParams },
        timestamp: Date.now()
      })
    ).pipe(
      map(() => ({
        offline: true,
        message: 'Pago individual guardado localmente (Sin internet).'
      }))
    );
  }

  private guardarUpdateCreditoLocal(creditoId: string, payload: any): Observable<any> {
    return from(
      this.dexie.syncQueue.add({
        type: 'PUT_CREDITO',
        data: { creditoId, payload },
        timestamp: Date.now()
      })
    ).pipe(
      map(() => ({
        offline: true,
        message: 'Actualización de crédito guardada localmente (Sin internet).'
      }))
    );
  }


  private guardarLocal(payload: any): Observable<any> {
    return of({
      offline: true,
      message: 'Sin conexión: Guardado localmente'
    });
    /* 
    Nota: Para soporte offline completo, debes agregar 'POST_CLIENTE' en el worker 
    y en DexieService similar a como tienes los grupos.
    */
  }
}
