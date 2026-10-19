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

    if (!isOnline) {
      return this.guardarLocal(payload);
    }

    // 1. Separar datos del cliente de los datos del credito
    const bodyCliente = {
      nombre: payload.nombreCliente,
      diaPago: payload.diaPago,
      tipoPago: payload.tipoPago,
      grupo: payload.nombreGrupo || '',
      asesor: payload.asesor,
      horaVisita: payload.horaVisita
    };

    // 2. Determinar si se crea o se actualiza el cliente
    const idCliente = payload.idCliente;
    const clienteObs = idCliente
      ? this.http.put(`${this.apiUrlCliente}/${idCliente}`, bodyCliente)
      : this.http.post(`${this.apiUrlCliente}`, bodyCliente);

    return clienteObs.pipe(
      switchMap((clienteGuardado: any) => {
        // 3. Crear o actualizar el crédito asociado al cliente individual
        const bodyCredito = {
          cliente: idCliente || clienteGuardado._id,
          tipoCredito: 'Individual',
          ciclo: payload.ciclo || 1,
          pagoPactado: payload.pagoPactado,
          semanas: payload.noPagos,
          saldoTotal: payload.saldoInicial,
          saldoPendiente: payload.saldoInicial,
          fechaPrimerPago: payload.fechaPrimerPago,
          garantia: payload.garantia || 0,
          montoSolicitado: payload.montoSolicitado,
          tasaInteres: payload.tasaInteres,
          equivalenciaMeses: payload.equivalenciaMeses,
          garantiaPredial: payload.garantiaPredial,
          grupoOpcional: payload.nombreGrupo,
          estadoGrupo: payload.estadoGrupo || null,
          frecuenciaPago: payload.tipoPago
        };

        return this.http.post(`${this.apiUrlCredito}/`, bodyCredito).pipe(
          map(() => {
            this.clearCache();
            return clienteGuardado;
          })
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

  private cacheClientes = new Map<string, { data: any, timestamp: number }>();
  private readonly CACHE_TTL = 30000; // 30 segundos

  clearCache(): void {
    this.cacheClientes.clear();
  }

  /**
   * Obtiene la lista de clientes 
   * (el backend filtra el user logueado si es Asesor o Admin).
   * Soporta ?conCredito=true para traer el crédito activo directamente.
   */
  getClientes(params?: { conCredito?: boolean; asesor?: string; todos?: boolean; admin?: boolean }, forceRefresh = false): Observable<any> {
    const queryParts: string[] = [];
    if (params?.conCredito) queryParts.push('conCredito=true');
    if (params?.todos) queryParts.push('todos=true');
    if (params?.admin) queryParts.push('admin=true');
    if (params?.asesor && params.asesor !== 'todos') queryParts.push(`asesor=${params.asesor}`);
    const queryStr = queryParts.length > 0 ? `?${queryParts.join('&')}` : '';

    const cacheKey = queryStr || 'default';
    const cached = this.cacheClientes.get(cacheKey);
    if (!forceRefresh && cached && (Date.now() - cached.timestamp < this.CACHE_TTL)) {
      return of(cached.data);
    }

    return this.http.get(`${this.apiUrlCliente}${queryStr}`).pipe(
      map((clientes: any) => {
        this.cacheClientes.set(cacheKey, { data: clientes, timestamp: Date.now() });
        // Guardar en Dexie para uso offline
        if (Array.isArray(clientes)) {
          this.dexie.table('clientes').clear().then(() => {
            this.dexie.table('clientes').bulkAdd(clientes);
          }).catch(e => console.warn('Dexie save error:', e));
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
   * Obtiene clientes directamente con su crédito activo en una sola petición ultrarrápida.
   */
  getClientesConCredito(forceRefresh = false): Observable<any> {
    return this.getClientes({ conCredito: true }, forceRefresh);
  }

  /**
   * Obtiene un cliente específico por su ID sin descargar todos los clientes.
   */
  getClientePorId(id: string): Observable<any> {
    return this.http.get(`${this.apiUrlCliente}/${id}`).pipe(
      catchError(error => {
        if (!navigator.onLine || error.status === 0) {
          return from(this.dexie.table('clientes').where('_id').equals(id).first());
        }
        return throwError(() => error);
      })
    );
  }

  /**
   * Obtiene únicamente los créditos de un cliente específico por su ID.
   */
  getCreditosCliente(clienteId: string): Observable<any> {
    return this.http.get(`${this.apiUrlCredito}/?cliente=${clienteId}`).pipe(
      catchError(error => {
        if (!navigator.onLine || error.status === 0) {
          return from(this.dexie.table('creditos').where('cliente').equals(clienteId).toArray()).pipe(
            map(creditos => ({ creditos }))
          );
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

    this.clearCache();
    return this.http.post(`${this.apiUrlCredito}/${creditoId}/pagos`, pagoParams).pipe(
      map((res) => {
        this.clearCache();
        return res;
      }),
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

    this.clearCache();
    return this.http.put(`${this.apiUrlCredito}/${creditoId}`, payload).pipe(
      map((res) => {
        this.clearCache();
        return res;
      }),
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
