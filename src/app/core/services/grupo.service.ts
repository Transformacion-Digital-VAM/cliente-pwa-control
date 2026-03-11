import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { DexieService } from '../database/dexie.service';
import { GrupoPayload } from '../models/grupo.model';
import { Observable, from, throwError, forkJoin, of } from 'rxjs';
import { catchError, map, switchMap } from 'rxjs/operators';

@Injectable({
    providedIn: 'root'
})
export class GrupoService {
    // private apiUrlGrupo = 'http://localhost:3000/api/grupos';
    // private apiUrlMiembro = 'http://localhost:3000/api/miembros';
    // private apiUrlCredito = 'http://localhost:3000/api/creditos';
    private apiUrlGrupo = 'http://192.168.1.82:3000/api/grupos';
    private apiUrlMiembro = 'http://192.168.1.82:3000/api/miembros';
    private apiUrlCredito = 'http://192.168.1.82:3000/api/creditos';

    constructor(
        private http: HttpClient,
        private dexie: DexieService
    ) { }

    crearGrupo(payload: GrupoPayload): Observable<any> {
        const isOnline = navigator.onLine;

        // Si no hay conexión de antemano, directo a Dexie
        if (!isOnline) {
            return this.guardarLocal(payload);
        }

        // Adaptamos el payload de Grupo para esquivar error de 'integrantes' en Backend
        const { integrantes, nombreGrupo, cicloActual, fechaPrimerPago, ...resto } = payload;
        const bodyGrupo = { ...resto, cicloActual, nombre: nombreGrupo };

        // Intentar POST del Grupo
        return this.http.post(`${this.apiUrlGrupo}/create`, bodyGrupo).pipe(
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
                        return this.http.post(`${this.apiUrlMiembro}/create`, bodyMiembro);
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
                                    fechaPrimerPago: fechaPrimerPago
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
                const isNetworkError = !navigator.onLine || error.status === 0 || error.status === 504 || error.status === 503 || error.status === 500;
                if (isNetworkError) {
                    console.warn(`[Network Error] Status: ${error.status} - Usando guardado local (Dexie)`);
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
        // return this.http.get(`http://localhost:3000/api/users/asesores`);
        return this.http.get(`http://192.168.1.82:3000/api/users/asesores`);
    }

    getMiembros(): Observable<any> {
        return this.http.get(`${this.apiUrlMiembro}/get`);
    }

    getCreditos(): Observable<any> {
        return this.http.get(`${this.apiUrlCredito}/`);
    }

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
