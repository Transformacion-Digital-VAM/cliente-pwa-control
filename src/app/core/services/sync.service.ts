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
    private apiUrlGrupo = `${environment.apiUrl}/grupos`;
    private apiUrlMiembro = `${environment.apiUrl}/miembros`;
    private apiUrlCredito = `${environment.apiUrl}/creditos`;
    private apiUrlMagico = `${environment.apiUrl}/magicos`;
    private isSyncing = false;

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
            this.syncData();
        });

        // Al iniciar, si ya hay internet y la app está estable
        this.appRef.isStable.pipe(
            first(isStable => isStable === true)
        ).subscribe(() => {
            if (navigator.onLine) {
                this.syncData();
            }
        });

        // Verificación inmediata por si acaso (poco después de arrancar)
        if (typeof navigator !== 'undefined' && navigator.onLine) {
            setTimeout(() => this.syncData(), 3000);
        }

        // Intervalo periódico de sincronización cada 45s si hay red
        setInterval(() => {
            if (typeof navigator !== 'undefined' && navigator.onLine) {
                this.syncData();
            }
        }, 45000);
    }

    async syncData() {
        if (this.isSyncing) return;
        this.isSyncing = true;
        try {
            const items = await this.dexie.syncQueue.toArray();
            if (items.length === 0) return;

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
                                const integ = integrantes[index] || {};
                                const numSemanas = Number(integ.semanas) || (integ.tipoCredito === '8S' ? 8 : 16);
                                const numMeses = Number(integ.equivalenciaMeses || integ.plazoMeses) || 4;
                                const bodyCredito = {
                                    miembro: miembroGuardado._id,
                                    ciclo: cicloActual || 1,
                                    tipoCredito: integ.tipoCredito || 'CC',
                                    pagoPactado: integ.pagoPactado,
                                    fechaPrimerPago: fechaPrimerPago,
                                    montoSolicitado: integ.montoSolicitado || 0,
                                    tasaInteres: integ.tasaInteres || 0,
                                    semanas: numSemanas,
                                    equivalenciaMeses: numMeses,
                                    garantia: integ.garantia !== undefined ? integ.garantia : (Number(integ.montoSolicitado || 0) * ((integ.porcentajeGarantia || 5) / 100)),
                                    porcentajeGarantia: integ.porcentajeGarantia !== undefined ? integ.porcentajeGarantia : 5
                                };
                                return this.http.post(`${this.apiUrlCredito}/`, bodyCredito);
                            });

                            if (peticionesCreditos.length > 0) {
                                await firstValueFrom(forkJoin(peticionesCreditos));
                            }
                        }

                        await this.dexie.syncQueue.delete(item.id!);
                    } catch (error: any) {
                        console.error(`Error al sincronizar Grupo ${item.id}:`, error);
                        if (await this.handleSyncError(item, error)) break;
                    }
                } else if (item.type === 'POST_PAGO') {
                    try {
                        const { creditoId, pagoParams } = item.data;
                        await firstValueFrom(this.http.post(`${this.apiUrlCredito}/${creditoId}/pagos`, pagoParams));
                        await this.dexie.syncQueue.delete(item.id!);
                        console.log(`[SyncService] Pago sincronizado exitosamente (ID: ${item.id})`);
                    } catch (error: any) {
                        console.error(`Error al sincronizar Pago ${item.id}:`, error);
                        if (await this.handleSyncError(item, error)) break;
                    }
                } else if (item.type === 'POST_AHORRO') {
                    try {
                        const { creditoId, ahorroParams } = item.data;
                        await firstValueFrom(this.http.post(`${this.apiUrlCredito}/${creditoId}/ahorro`, ahorroParams));
                        await this.dexie.syncQueue.delete(item.id!);
                        console.log(`[SyncService] Ahorro sincronizado exitosamente (ID: ${item.id})`);
                    } catch (error: any) {
                        console.error(`Error al sincronizar Ahorro ${item.id}:`, error);
                        if (await this.handleSyncError(item, error)) break;
                    }
                } else if (item.type === 'PUT_CREDITO') {
                    try {
                        const { creditoId, payload } = item.data;
                        await firstValueFrom(this.http.put(`${this.apiUrlCredito}/${creditoId}`, payload));
                        await this.dexie.syncQueue.delete(item.id!);
                        console.log(`[SyncService] Crédito actualizado exitosamente (ID: ${item.id})`);
                    } catch (error: any) {
                        console.error(`Error al sincronizar actualización de Crédito ${item.id}:`, error);
                        if (await this.handleSyncError(item, error)) break;
                    }
                } else if (item.type === 'POST_PAGO_MAGICO') {
                    try {
                        const { creditoId, pagoParams } = item.data;
                        await firstValueFrom(this.http.post(`${this.apiUrlMagico}/${creditoId}/pagos`, pagoParams));
                        await this.dexie.syncQueue.delete(item.id!);
                        console.log(`[SyncService] Pago Mágico sincronizado exitosamente (ID: ${item.id})`);
                    } catch (error: any) {
                        console.error(`Error al sincronizar Pago Mágico ${item.id}:`, error);
                        if (error.status === 400 || error.status === 404 || error.status === 409) {
                            console.warn(`[SyncService] Descartando pago mágico ${item.id} por error ${error.status}:`, error.error?.msg || error.message);
                            await this.dexie.syncQueue.delete(item.id!);
                        } else if (error.status === 0 || !navigator.onLine) {
                            break;
                        }
                    }
                }
            }
        } catch (e) {
            console.error('Error accediendo a la base de datos local', e);
        } finally {
            this.isSyncing = false;
        }
    }

    /**
     * Maneja errores de sincronización evitando bucles infinitos cada 45s.
     * Retorna true si se debe pausar la cola por falta de red.
     */
    private async handleSyncError(item: { id?: number; retries?: number }, error: any): Promise<boolean> {
        if (error?.status === 0 || !navigator.onLine) {
            return true;
        }
        const status = error?.status;
        const retries = (item.retries || 0) + 1;
        if (status === 400 || status === 404 || status === 409 || retries >= 5) {
            console.warn(`[SyncService] Descartando item ${item.id} de la cola (status=${status}, retries=${retries})`);
            await this.dexie.syncQueue.delete(item.id!);
        } else {
            await this.dexie.syncQueue.update(item.id!, { retries });
        }
        return false;
    }
}
