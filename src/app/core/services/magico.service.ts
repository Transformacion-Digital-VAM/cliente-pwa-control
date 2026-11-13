import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, from, of } from 'rxjs';
import { catchError, map, timeout } from 'rxjs/operators';
import { DexieService } from '../database/dexie.service';
import { environment } from '../../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class MagicoService {
  private apiUrl = `${environment.apiUrl}/magicos`;

  constructor(
    private http: HttpClient,
    private dexie: DexieService
  ) {}

  getElegibilidadGrupo(grupoId: string, params?: { campanaMes?: number; campanaAnio?: number }): Observable<any> {
    let httpParams = new HttpParams();
    if (params?.campanaMes) httpParams = httpParams.set('campanaMes', String(params.campanaMes));
    if (params?.campanaAnio) httpParams = httpParams.set('campanaAnio', String(params.campanaAnio));
    return this.http.get(`${this.apiUrl}/elegibilidad/${grupoId}`, { params: httpParams }).pipe(
      timeout(20000)
    );
  }

  crearCreditosMagicos(payload: {
    grupoId: string;
    asesorId?: string;
    integrantes: Array<{
      miembroId: string;
      montoSolicitado: number;
      fechaPrimerPago: string;
    }>;
  }): Observable<any> {
    return this.http.post(`${this.apiUrl}`, payload).pipe(
      timeout(20000)
    );
  }

  getCreditosMagicos(params?: {
    grupo?: string;
    asesor?: string;
    coordinacion?: string;
    campanaClave?: string;
    estado?: string;
  }): Observable<any> {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      return this.leerMagicosDesdeDexie(params);
    }

    let httpParams = new HttpParams();
    if (params?.grupo) httpParams = httpParams.set('grupo', params.grupo);
    if (params?.asesor && params.asesor !== 'todos') httpParams = httpParams.set('asesor', params.asesor);
    if (params?.coordinacion && params.coordinacion !== 'todas') httpParams = httpParams.set('coordinacion', params.coordinacion);
    if (params?.campanaClave) httpParams = httpParams.set('campanaClave', params.campanaClave);
    if (params?.estado) httpParams = httpParams.set('estado', params.estado);

    return this.http.get(`${this.apiUrl}`, { params: httpParams }).pipe(
      timeout(20000),
      map((res: any) => {
        const creditos = res?.creditos || [];
        if (Array.isArray(creditos) && !params?.grupo && !params?.campanaClave && (!params?.estado || params?.estado === 'todos')) {
          this.dexie.table('creditos_magicos').clear().then(() => {
            if (creditos.length > 0) {
              this.dexie.table('creditos_magicos').bulkAdd(creditos);
            }
          }).catch(e => console.warn('[Dexie] Error guardando créditos mágicos:', e));
        }
        return res;
      }),
      catchError(error => {
        console.warn('[MagicoService] Falló getCreditosMagicos en red, usando Dexie:', error?.message);
        return this.leerMagicosDesdeDexie(params);
      })
    );
  }

  getHojaGrupoMagicos(grupoId: string, incluirLiquidados = false): Observable<any> {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      return this.leerHojaGrupoDesdeDexie(grupoId, incluirLiquidados);
    }

    let httpParams = new HttpParams();
    if (incluirLiquidados) httpParams = httpParams.set('incluirLiquidados', 'true');

    return this.http.get(`${this.apiUrl}/grupo/${grupoId}`, { params: httpParams }).pipe(
      timeout(20000),
      map((res: any) => {
        const creditos = res?.creditos || [];
        if (Array.isArray(creditos) && creditos.length > 0) {
          this.sincronizarGrupoEnDexie(grupoId, creditos);
        }
        return res;
      }),
      catchError(error => {
        console.warn('[MagicoService] Falló getHojaGrupoMagicos en red, usando Dexie:', error?.message);
        return this.leerHojaGrupoDesdeDexie(grupoId, incluirLiquidados);
      })
    );
  }

  registrarPagoMagico(creditoId: string, pagoParams: any): Observable<any> {
    const isOnline = typeof navigator === 'undefined' ? true : navigator.onLine;
    if (!isOnline) {
      return this.guardarPagoMagicoLocal(creditoId, pagoParams);
    }

    return this.http.post(`${this.apiUrl}/${creditoId}/pagos`, pagoParams).pipe(
      timeout(25000),
      catchError(error => {
        const isNetworkError = (typeof navigator !== 'undefined' && !navigator.onLine)
          || error?.name === 'TimeoutError'
          || error?.status === 0
          || error?.status === 503
          || error?.status === 504;
        if (isNetworkError) {
          return this.guardarPagoMagicoLocal(creditoId, pagoParams);
        }
        throw error;
      })
    );
  }

  registrarPagosGrupoMagicos(payload: {
    grupoId: string;
    numeroRecibo: string;
    fechaPago?: string | Date;
    ubicacion?: any;
    pagos: any[];
  }): Observable<any> {
    return this.http.post(`${this.apiUrl}/pagos-grupo`, payload).pipe(
      timeout(25000)
    );
  }

  cancelarCreditoMagico(creditoId: string, motivo = 'Cancelación administrativa'): Observable<any> {
    return this.http.put(`${this.apiUrl}/${creditoId}/cancelar`, { motivo }).pipe(
      timeout(20000)
    );
  }

  private async sincronizarGrupoEnDexie(grupoId: string, creditosGrupo: any[]): Promise<void> {
    try {
      const tabla = this.dexie.table('creditos_magicos');
      const existentes = await tabla.toArray();
      const idsGrupoActual = new Set(creditosGrupo.map(c => String(c._id)));
      const aEliminar = existentes
        .filter((item: any) => {
          const gId = item.grupo?._id || item.grupo;
          return String(gId) === String(grupoId) && !idsGrupoActual.has(String(item._id));
        })
        .map((item: any) => item.id)
        .filter(id => id !== undefined);
      if (aEliminar.length > 0) {
        await tabla.bulkDelete(aEliminar);
      }
      for (const cred of creditosGrupo) {
        const prev = existentes.find((e: any) => String(e._id) === String(cred._id));
        if (prev?.id !== undefined) {
          await tabla.put({ ...cred, id: prev.id });
        } else {
          await tabla.add(cred);
        }
      }
    } catch (e) {
      console.warn('[Dexie] Error sincronizando mágicos de grupo:', e);
    }
  }

  private leerMagicosDesdeDexie(params?: any): Observable<any> {
    return from(
      this.dexie.table('creditos_magicos').toArray().then(all => {
        const filtered = (all || []).filter((c: any) => {
          const gId = c.grupo?._id || c.grupo;
          const aId = c.asesor?._id || c.asesor;
          if (params?.grupo && String(gId) !== String(params.grupo)) return false;
          if (params?.asesor && params.asesor !== 'todos' && String(aId) !== String(params.asesor)) return false;
          if (params?.campanaClave && c.campanaClave !== params.campanaClave) return false;
          if (params?.estado && params.estado !== 'todos' && c.estado !== params.estado) return false;
          return true;
        });
        return { ok: true, creditos: filtered, offline: true };
      })
    );
  }

  private leerHojaGrupoDesdeDexie(grupoId: string, incluirLiquidados: boolean): Observable<any> {
    return from(
      Promise.all([
        this.dexie.table('grupos').toArray(),
        this.dexie.table('creditos_magicos').toArray()
      ]).then(([grupos, magicos]) => {
        const grupo = (grupos || []).find((g: any) => String(g._id) === String(grupoId)) || null;
        const creditos = (magicos || []).filter((c: any) => {
          const gId = c.grupo?._id || c.grupo;
          if (String(gId) !== String(grupoId)) return false;
          if (c.estado === 'Cancelado') return false;
          if (!incluirLiquidados && c.estado !== 'Activo') return false;
          return true;
        });
        return { ok: true, grupo, creditos, offline: true };
      })
    );
  }

  private guardarPagoMagicoLocal(creditoId: string, pagoParams: any): Observable<any> {
    return from((async () => {
      await this.dexie.syncQueue.add({
        type: 'POST_PAGO_MAGICO',
        data: { creditoId, pagoParams },
        timestamp: Date.now()
      });

      try {
        const all = await this.dexie.table('creditos_magicos').toArray();
        const cred = all.find((c: any) => String(c._id) === String(creditoId));
        if (cred) {
          if (!cred.pagos) cred.pagos = [];
          const montoPag = Number(pagoParams.montoPagado) || 0;
          cred.pagos.push({
            montoPagado: montoPag,
            fechaPago: pagoParams.fechaPago || new Date().toISOString(),
            numeroRecibo: pagoParams.numeroRecibo || null,
            metodoPago: pagoParams.metodoPago || 'EFECTIVO'
          });
          if (montoPag > 0 && cred.saldoPendiente !== undefined) {
            cred.saldoPendiente = Math.max(0, Number(cred.saldoPendiente) - montoPag);
            if (cred.saldoPendiente <= 0) {
              cred.estado = 'Liquidado';
            }
          }
          await this.dexie.table('creditos_magicos').put(cred);
        }
      } catch (e) {
        console.warn('[Dexie] Error actualizando crédito mágico local:', e);
      }

      return {
        offline: true,
        message: 'Pago mágico guardado sin conexión. Se sincronizará automáticamente.'
      };
    })());
  }
}

