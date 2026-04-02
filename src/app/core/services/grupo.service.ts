import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { DexieService } from '../database/dexie.service';
import { GrupoPayload } from '../models/grupo.model';
import { Observable, from, throwError, forkJoin, of } from 'rxjs';
import { catchError, map, switchMap } from 'rxjs/operators';
import { environment } from '../../../environments/environment';

@Injectable({
    providedIn: 'root'
})
export class GrupoService {
    private apiUrlGrupo = `${environment.apiUrl}/grupos`;
    private apiUrlMiembro = `${environment.apiUrl}/miembros`;
    private apiUrlCredito = `${environment.apiUrl}/creditos`;

    constructor(
        private http: HttpClient,
        private dexie: DexieService
    ) { }

    crearGrupo(payload: GrupoPayload): Observable<any> {
        const isOnline = navigator.onLine;

        // Si no hay conexión, directo a Dexie
        if (!isOnline) {
            return this.guardarLocal(payload);
        }

        // Adaptación de payload de Grupo para esquivar error de 'integrantes' en Backend
        const { integrantes, nombreGrupo, cicloActual, fechaPrimerPago, plazoSemanas, plazoMeses, grupoId, ...resto } = payload;
        const bodyGrupo = { ...resto, cicloActual, nombre: nombreGrupo, plazoSemanas, plazoMeses };

        const grupoObs = grupoId
            ? of({ _id: grupoId })
            : this.http.post(`${this.apiUrlGrupo}/create`, bodyGrupo);

        // Enviar un POST del Grupo o usar id existente
        return grupoObs.pipe(
            switchMap((grupoGuardado: any) => {
                // Enviar peticiones para cada Integrante
                if (integrantes && integrantes.length > 0) {
                    const peticionesMiembros = integrantes.map(integ => {
                        const mapRol: any = {
                            'presidenta': 'PRESIDENTA',
                            'secretaria': 'SECRETARIA',
                            'tesorera': 'TESORERA',
                            'vocal': 'INTEGRANTE',
                            '': 'INTEGRANTE'
                        };
                        const rol = mapRol[integ.cargo?.toLowerCase()] || 'INTEGRANTE';

                        const bodyMiembro = {
                            nombre: integ.nombre || 'Sin Nombre',
                            apellidos: integ.apellidos || 'Sin Apellidos',
                            grupo: grupoGuardado._id,
                            rol,
                            pagoPactado: integ.pagoPactado
                        };

                        return integ.miembroId
                            ? of({ _id: integ.miembroId })
                            : this.http.post(`${this.apiUrlMiembro}/create`, bodyMiembro);
                    });

                    return forkJoin(peticionesMiembros).pipe(
                        switchMap((miembrosGuardados: any[]) => {
                            const peticionesCreditos = miembrosGuardados.map((miembroGuardado, index) => {
                                const integ = integrantes[index];
                                const bodyCredito = {
                                    miembro: miembroGuardado._id,
                                    ciclo: cicloActual || 1,
                                    tipoCredito: integ.tipoCredito || 'CC',
                                    pagoPactado: integ.pagoPactado,
                                    fechaPrimerPago: fechaPrimerPago,
                                    montoSolicitado: integ.montoSolicitado,
                                    tasaInteres: integ.tasaInteres,
                                    semanas: plazoSemanas || 16
                                };
                                return this.http.post(`${this.apiUrlCredito}/`, bodyCredito);
                            });

                            if (peticionesCreditos.length > 0) {
                                return forkJoin(peticionesCreditos).pipe(map(() => grupoGuardado));
                            }
                            return of(grupoGuardado);
                        })
                    );
                }
                return of(grupoGuardado);
            }),
            catchError(error => {
        const isNetworkError = !navigator.onLine || error.status === 0 || error.status === 504 || error.status === 503;
                if (isNetworkError) {
                    console.warn(`[Network Error] Status: ${error.status} - Se guardo local`);
                    return this.guardarLocal(payload);
                }
                return throwError(() => error);
            })
        );
    }

    getGrupos(): Observable<any> {
        return this.http.get(`${this.apiUrlGrupo}/get`);
    }

    getAsesores(): Observable<any> {
        return this.http.get(`${this.apiUrlGrupo}/asesores`);
    }

    getMiembros(): Observable<any> {
        return this.http.get(`${this.apiUrlMiembro}/get`);
    }

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
                        map(creditos => ({ creditos }))
                    );
                }
                return throwError(() => error);
            })
        );
    }


    getCoordinaciones(): Observable<any> {
        return this.http.get(`${this.apiUrlGrupo}/coordinacion`);
    }

    actualizarCredito(creditoId: string, payload: any): Observable<any> {
        return this.http.put(`${this.apiUrlCredito}/${creditoId}`, payload);
    }

    // Registrar pago por integrante de grupo
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

    // Registrar ahorro por integrante de grupo
    registrarAhorro(creditoId: string, ahorroParams: any): Observable<any> {
        const isOnline = navigator.onLine;
        if (!isOnline) {
            return this.guardarAhorroLocal(creditoId, ahorroParams);
        }

        return this.http.post(`${this.apiUrlCredito}/${creditoId}/ahorro`, ahorroParams).pipe(
            catchError(error => {
                if (!navigator.onLine || error.status === 0) {
                    return this.guardarAhorroLocal(creditoId, ahorroParams);
                }
                return throwError(() => error);
            })
        );
    }

    // Guardar pago localmente
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
                message: 'Pago guardado sin conexión. Se sincronizará automáticamente.'
            }))
        );
    }


    // Guardar ahorro localmente
    private guardarAhorroLocal(creditoId: string, ahorroParams: any): Observable<any> {
        return from(
            this.dexie.syncQueue.add({
                type: 'POST_AHORRO',
                data: { creditoId, ahorroParams },
                timestamp: Date.now()
            })
        ).pipe(
            map(() => ({
                offline: true,
                message: 'Ahorro guardado sin conexión. Se sincronizará automáticamente.'
            }))
        );
    }


    // Guardar grupo localmente
    private guardarLocal(payload: GrupoPayload): Observable<any> {
        return from(
            this.dexie.syncQueue.add({
                type: 'POST_GRUPO',
                data: payload,
                timestamp: Date.now()
            })
        ).pipe(
            map(() => ({
                offline: true,
                message: 'Sin conexión: Guardado localmente. Se sincronizará automáticamente al recuperar la red.'
            }))
        );
    }
}
