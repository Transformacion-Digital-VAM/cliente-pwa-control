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
    private apiUrlGrupo = 'http://localhost:3000/api/grupo';
    private apiUrlMiembro = 'http://localhost:3000/api/miembro';

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
        const { integrantes, nombreGrupo, ...resto } = payload;
        const bodyGrupo = { ...resto, nombre: nombreGrupo };

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

                    return forkJoin(peticionesMiembros).pipe(map(() => grupoGuardado));
                }
                return of(grupoGuardado);
            }),
            catchError(error => {
                if (error.status === 0 || error.status === 504) {
                    return this.guardarLocal(payload);
                }
                return throwError(() => error);
            })
        );
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
