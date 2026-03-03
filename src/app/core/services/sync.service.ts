import { Injectable, ApplicationRef } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { DexieService } from '../database/dexie.service';
import { first } from 'rxjs/operators';
import { firstValueFrom, forkJoin } from 'rxjs';

@Injectable({
    providedIn: 'root'
})
export class SyncService {
    private apiUrlGrupo = 'http://localhost:3000/api/grupo';
    private apiUrlMiembro = 'http://localhost:3000/api/miembro';

    constructor(
        private http: HttpClient,
        private dexie: DexieService,
        private appRef: ApplicationRef
    ) {
        // Solo inicia si estamos en el navegador
        if (typeof window !== 'undefined') {
            this.initSyncListener();
        }
    }

    private initSyncListener() {
        window.addEventListener('online', () => {
            console.log('[SyncService] Conexión recuperada, intentando sincronizar...');
            this.syncData();
        });

        this.appRef.isStable.pipe(
            first(isStable => isStable === true)
        ).subscribe(() => {
            if (navigator.onLine) this.syncData();
        });
    }

    async syncData() {
        try {
            const items = await this.dexie.syncQueue.toArray();
            if (items.length === 0) return;

            console.log(`[SyncService] Encontrados ${items.length} elementos para sincronizar.`);

            for (const item of items) {
                if (item.type === 'POST_GRUPO') {
                    try {
                        const payload = item.data;
                        const { integrantes, nombreGrupo, ...resto } = payload;
                        const bodyGrupo = { ...resto, nombre: nombreGrupo };

                        const grupoGuardado: any = await firstValueFrom(this.http.post(`${this.apiUrlGrupo}/create`, bodyGrupo));

                        if (integrantes && integrantes.length > 0) {
                            const peticionesMiembros = integrantes.map((integ: any) => {
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
                            await firstValueFrom(forkJoin(peticionesMiembros));
                        }

                        await this.dexie.syncQueue.delete(item.id!);
                        console.log(`[SyncService] Sincronización exitosa para elemento ${item.id}`);
                    } catch (error: any) {
                        console.error(`[SyncService] Error al sincronizar elemento ${item.id}`, error);
                    }
                }
            }
        } catch (e) {
            console.error('[SyncService] Error accediendo a la base de datos local', e);
        }
    }
}
