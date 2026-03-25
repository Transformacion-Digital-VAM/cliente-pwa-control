import { Injectable, ApplicationRef } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { DexieService } from '../database/dexie.service';
import { first } from 'rxjs/operators';
import { firstValueFrom, forkJoin } from 'rxjs';
import { environment } from '../../../environments/environment';

@Injectable({
    providedIn: 'root'
})
export class SyncService {
    // private apiUrlGrupo = 'http://localhost:3000/api/grupos';
    // private apiUrlMiembro = 'http://localhost:3000/api/miembros';
    // private apiUrlCredito = 'http://localhost:3000/api/creditos';
    private apiUrlGrupo = `${environment.apiUrl}/grupos`;
    private apiUrlMiembro = `${environment.apiUrl}/miembros`;
    private apiUrlCredito = `${environment.apiUrl}/creditos`;

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
        // Al recuperar conexión
        window.addEventListener('online', () => {
            console.log('[SyncService] Conexión detectada (online event).');
            this.syncData();
        });

        // Al iniciar, si ya hay internet y la app está estable
        this.appRef.isStable.pipe(
            first(isStable => isStable === true)
        ).subscribe(() => {
            console.log('[SyncService] App estable, verificando conexión...');
            if (navigator.onLine) {
                this.syncData();
            }
        });

        // Verificación inmediata por si acaso (poco después de arrancar)
        if (typeof navigator !== 'undefined' && navigator.onLine) {
            setTimeout(() => this.syncData(), 3000);
        }
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
                        const { integrantes, nombreGrupo, cicloActual, fechaPrimerPago, ...resto } = payload;
                        const bodyGrupo = { ...resto, cicloActual, nombre: nombreGrupo };

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

                            const miembrosGuardados = await firstValueFrom(forkJoin(peticionesMiembros)) as any[];

                            // Ahora crear los créditos para cada miembro
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
                                await firstValueFrom(forkJoin(peticionesCreditos));
                            }
                        }

                        await this.dexie.syncQueue.delete(item.id!);
                        console.log(`[SyncService] Sincronización exitosa para elemento ${item.id}`);
                    } catch (error: any) {
                        console.error(`[SyncService] Error al sincronizar elemento ${item.id}`, error);
                    }
                } else if (item.type === 'POST_PAGO') {
                    try {
                        const { creditoId, pagoParams } = item.data;
                        await firstValueFrom(this.http.post(`${this.apiUrlCredito}/${creditoId}/pagos`, pagoParams));
                        await this.dexie.syncQueue.delete(item.id!);
                        console.log(`[SyncService] Pago sincronizado correctamente: ${item.id}`);
                    } catch (error: any) {
                        console.error(`[SyncService] Error al sincronizar Pago ${item.id}`, error);
                    }
                } else if (item.type === 'POST_AHORRO') {
                    try {
                        const { creditoId, ahorroParams } = item.data;
                        await firstValueFrom(this.http.post(`${this.apiUrlCredito}/${creditoId}/ahorro`, ahorroParams));
                        await this.dexie.syncQueue.delete(item.id!);
                        console.log(`[SyncService] Ahorro sincronizado correctamente: ${item.id}`);
                    } catch (error: any) {
                        console.error(`[SyncService] Error al sincronizar Ahorro ${item.id}`, error);
                    }
                } else if (item.type === 'PUT_CREDITO') {
                    try {
                        const { creditoId, payload } = item.data;
                        await firstValueFrom(this.http.put(`${this.apiUrlCredito}/${creditoId}`, payload));
                        await this.dexie.syncQueue.delete(item.id!);
                        console.log(`[SyncService] Crédito actualizado correctamente: ${item.id}`);
                    } catch (error: any) {
                        console.error(`[SyncService] Error al sincronizar actualización de Crédito ${item.id}`, error);
                    }
                }
            }
        } catch (e) {
            console.error('[SyncService] Error accediendo a la base de datos local', e);
        }
    }
}
