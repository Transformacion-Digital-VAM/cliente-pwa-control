import { Injectable, ApplicationRef } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { DexieService, OfflineRequest } from '../database/dexie.service';
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
    private apiUrlCliente = `${environment.apiUrl}/clientes`;
    private isSyncing = false;

    constructor(
        private http: HttpClient,
        private dexie: DexieService,
        private appRef: ApplicationRef
    ) {
        if (typeof window !== 'undefined') {
            this.initSyncListener();
        }
    }

    private initSyncListener() {
        // Al recuperar conexión
        window.addEventListener('online', () => {
            console.log('[SyncService] Conexión recuperada (evento online), iniciando sincronización...');
            this.syncData();
        });

        // Al iniciar, si ya hay internet y la app está estable
        this.appRef.isStable.pipe(
            first(isStable => isStable === true)
        ).subscribe(() => {
            if (typeof navigator !== 'undefined' && navigator.onLine) {
                this.syncData();
            }
        });

        // Verificación inicial de respaldo a los 3 segundos
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

    /**
     * Procesa la cola de sincronización de manera secuencial y segura.
     */
    async syncData() {
        if (this.isSyncing) return;
        if (typeof navigator !== 'undefined' && !navigator.onLine) return;

        this.isSyncing = true;
        try {
            // Filtrar solo peticiones pendientes (no fallidas permanentemente)
            const items = await this.dexie.syncQueue
                .filter((item: OfflineRequest) => item.status !== 'FAILED')
                .toArray();

            if (items.length === 0) return;

            console.log(`[SyncService] Procesando ${items.length} elemento(s) pendiente(s) en cola...`);

            for (const item of items) {
                // Verificar red antes de procesar cada elemento
                if (typeof navigator !== 'undefined' && !navigator.onLine) {
                    console.log('[SyncService] Conexión perdida durante la sincronización. Pausando cola.');
                    break;
                }

                if (item.type === 'POST_GRUPO') {
                    try {
                        const payload = item.data;
                        const {
                            integrantes, nombreGrupo, cicloActual, fechaPrimerPago,
                            plazoSemanas, plazoMeses, grupoId, porcentajeGarantia, estadoGrupo, ...resto
                        } = payload;

                        const diaFinal = payload.diaVisita || payload.diaPago;
                        const bodyGrupo = {
                            ...resto,
                            cicloActual,
                            nombre: nombreGrupo,
                            plazoSemanas,
                            plazoMeses,
                            porcentajeGarantia,
                            fechaPrimerPago,
                            diaVisita: diaFinal,
                            diaPago: diaFinal
                        };

                        const grupoGuardado: any = grupoId
                            ? await firstValueFrom(this.http.put(`${this.apiUrlGrupo}/update/${grupoId}`, bodyGrupo))
                            : await firstValueFrom(this.http.post(`${this.apiUrlGrupo}/create`, bodyGrupo));

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
                                return integ.miembroId
                                    ? this.http.put(`${this.apiUrlMiembro}/update/${integ.miembroId}`, bodyMiembro)
                                    : this.http.post(`${this.apiUrlMiembro}/create`, bodyMiembro);
                            });

                            const miembrosGuardados = await firstValueFrom(forkJoin(peticionesMiembros)) as any[];

                            // Crear los créditos para cada integrante con todos los datos necesarios
                            const peticionesCreditos = miembrosGuardados.map((miembroGuardado, index) => {
                                const integ = integrantes[index];
                                const numSemanas = Number(plazoSemanas) || 16;
                                const numMeses = Number(plazoMeses) || 4;
                                const frecCalculada = (numSemanas === 8 && numMeses === 4) || (numMeses > 0 && (numSemanas / numMeses) <= 2.5 && numSemanas < 16)
                                    ? 'Bisemanal'
                                    : 'Semanal';

                                const bodyCredito = {
                                    miembro: miembroGuardado._id,
                                    ciclo: cicloActual || 1,
                                    tipoCredito: integ.tipoCredito || 'CC',
                                    estadoGrupo: estadoGrupo || null,
                                    pagoPactado: integ.pagoPactado,
                                    fechaPrimerPago: fechaPrimerPago,
                                    montoSolicitado: integ.montoSolicitado,
                                    tasaInteres: integ.tasaInteres,
                                    semanas: numSemanas,
                                    equivalenciaMeses: numMeses,
                                    frecuenciaPago: frecCalculada,
                                    porcentajeGarantia: porcentajeGarantia !== undefined ? porcentajeGarantia : 5
                                };
                                return this.http.post(`${this.apiUrlCredito}/`, bodyCredito);
                            });

                            if (peticionesCreditos.length > 0) {
                                await firstValueFrom(forkJoin(peticionesCreditos));
                            }
                        }

                        await this.dexie.syncQueue.delete(item.id!);
                        console.log(`[SyncService] Grupo sincronizado exitosamente (ID: ${item.id})`);
                    } catch (error: any) {
                        console.error(`[SyncService] Error al sincronizar Grupo ${item.id}:`, error);
                        const msg = (error.error?.msg || error.message || '').toLowerCase();
                        const esDuplicado = msg.includes('ya existe') || msg.includes('duplicado');

                        if (esDuplicado) {
                            console.warn(`[SyncService] Grupo ${item.id} ya existía en el servidor. Removiendo de cola.`);
                            await this.dexie.syncQueue.delete(item.id!);
                        } else if (error.status === 0 || !navigator.onLine || error.status === 401) {
                            break;
                        } else {
                            item.status = 'FAILED';
                            item.errorMsg = error.error?.msg || error.message;
                            await this.dexie.syncQueue.put(item);
                        }
                    }
                } else if (item.type === 'POST_CLIENTE') {
                    try {
                        const payload = item.data;
                        const diaFinal = payload.diaPago || payload.diaVisita;
                        const bodyCliente = {
                            nombre: payload.nombreCliente,
                            diaPago: diaFinal,
                            diaVisita: diaFinal,
                            tipoPago: payload.tipoPago,
                            grupo: payload.nombreGrupo || '',
                            asesor: payload.asesor,
                            horaVisita: payload.horaVisita,
                            fechaPrimerPago: payload.fechaPrimerPago
                        };

                        const idCliente = payload.idCliente;
                        const clienteGuardado: any = idCliente
                            ? await firstValueFrom(this.http.put(`${this.apiUrlCliente}/${idCliente}`, bodyCliente))
                            : await firstValueFrom(this.http.post(`${this.apiUrlCliente}`, bodyCliente));

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

                        await firstValueFrom(this.http.post(`${this.apiUrlCredito}/`, bodyCredito));
                        await this.dexie.syncQueue.delete(item.id!);
                        console.log(`[SyncService] Cliente individual sincronizado exitosamente (ID: ${item.id})`);
                    } catch (error: any) {
                        console.error(`[SyncService] Error al sincronizar Cliente Individual ${item.id}:`, error);
                        const msg = (error.error?.msg || error.message || '').toLowerCase();
                        const esDuplicado = msg.includes('ya existe') || msg.includes('duplicado');

                        if (esDuplicado) {
                            console.warn(`[SyncService] Cliente ${item.id} ya existía en el servidor. Removiendo de cola.`);
                            await this.dexie.syncQueue.delete(item.id!);
                        } else if (error.status === 0 || !navigator.onLine || error.status === 401) {
                            break;
                        } else {
                            item.status = 'FAILED';
                            item.errorMsg = error.error?.msg || error.message;
                            await this.dexie.syncQueue.put(item);
                        }
                    }
                } else if (item.type === 'POST_PAGO') {
                    try {
                        const { creditoId, pagoParams } = item.data;
                        pagoParams.isOfflineSync = true;
                        await firstValueFrom(this.http.post(`${this.apiUrlCredito}/${creditoId}/pagos`, pagoParams));
                        await this.dexie.syncQueue.delete(item.id!);
                        console.log(`[SyncService] Pago sincronizado exitosamente (ID: ${item.id})`);
                    } catch (error: any) {
                        console.error(`[SyncService] Error al sincronizar Pago ${item.id}:`, error);
                        const msg = (error.error?.msg || error.message || '').toLowerCase();
                        const esDuplicado = msg.includes('ya existe') || msg.includes('duplicado') || msg.includes('ya se registró');

                        if (esDuplicado) {
                            console.warn(`[SyncService] Pago ${item.id} ya registrado previamente en servidor. Removiendo de cola:`, msg);
                            await this.dexie.syncQueue.delete(item.id!);
                        } else if (error.status === 0 || !navigator.onLine || error.status === 401) {
                            break;
                        } else {
                            console.error(`[SyncService] Error no recuperable en Pago ${item.id} (${error.status}):`, msg);
                            item.status = 'FAILED';
                            item.errorMsg = error.error?.msg || error.message;
                            await this.dexie.syncQueue.put(item);
                        }
                    }
                } else if (item.type === 'POST_AHORRO') {
                    try {
                        const { creditoId, ahorroParams } = item.data;
                        ahorroParams.isOfflineSync = true;
                        await firstValueFrom(this.http.post(`${this.apiUrlCredito}/${creditoId}/ahorro`, ahorroParams));
                        await this.dexie.syncQueue.delete(item.id!);
                        console.log(`[SyncService] Ahorro sincronizado exitosamente (ID: ${item.id})`);
                    } catch (error: any) {
                        console.error(`[SyncService] Error al sincronizar Ahorro ${item.id}:`, error);
                        const msg = (error.error?.msg || error.message || '').toLowerCase();
                        const esDuplicado = msg.includes('ya existe') || msg.includes('duplicado');

                        if (esDuplicado) {
                            console.warn(`[SyncService] Ahorro ${item.id} ya registrado previamente. Removiendo de cola.`);
                            await this.dexie.syncQueue.delete(item.id!);
                        } else if (error.status === 0 || !navigator.onLine || error.status === 401) {
                            break;
                        } else {
                            item.status = 'FAILED';
                            item.errorMsg = error.error?.msg || error.message;
                            await this.dexie.syncQueue.put(item);
                        }
                    }
                } else if (item.type === 'PUT_CREDITO') {
                    try {
                        const { creditoId, payload } = item.data;
                        await firstValueFrom(this.http.put(`${this.apiUrlCredito}/${creditoId}`, payload));
                        await this.dexie.syncQueue.delete(item.id!);
                        console.log(`[SyncService] Crédito actualizado exitosamente (ID: ${item.id})`);
                    } catch (error: any) {
                        console.error(`[SyncService] Error al sincronizar actualización de Crédito ${item.id}:`, error);
                        if (error.status === 0 || !navigator.onLine || error.status === 401) {
                            break;
                        } else {
                            item.status = 'FAILED';
                            item.errorMsg = error.error?.msg || error.message;
                            await this.dexie.syncQueue.put(item);
                        }
                    }
                }
            }
        } catch (e) {
            console.error('[SyncService] Error accediendo a la base de datos local:', e);
        } finally {
            this.isSyncing = false;
        }
    }

    /**
     * Retorna el conteo de elementos pendientes y fallidos en la cola.
     */
    async getPendingStatus(): Promise<{ total: number; pending: number; failed: number }> {
        try {
            const all = await this.dexie.syncQueue.toArray();
            const failed = all.filter(i => i.status === 'FAILED').length;
            const pending = all.length - failed;
            return { total: all.length, pending, failed };
        } catch {
            return { total: 0, pending: 0, failed: 0 };
        }
    }

    /**
     * Reintenta los elementos marcados como FAILED.
     */
    async retryFailed(): Promise<void> {
        try {
            const failed = await this.dexie.syncQueue.filter(i => i.status === 'FAILED').toArray();
            for (const f of failed) {
                f.status = undefined;
                f.errorMsg = undefined;
                await this.dexie.syncQueue.put(f);
            }
            await this.syncData();
        } catch (e) {
            console.error('[SyncService] Error al reintentar fallidos:', e);
        }
    }
}
