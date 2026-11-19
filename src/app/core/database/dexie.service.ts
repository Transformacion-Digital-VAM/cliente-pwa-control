import { Injectable } from '@angular/core';
import Dexie, { Table } from 'dexie';

export interface OfflineRequest {
    id?: number;
    type: string;
    data: any;
    timestamp: number;
    status?: 'PENDING' | 'SENDING' | 'FAILED' | 'SYNCED';
    errorMsg?: string;
    clientId?: string;
}

@Injectable({
    providedIn: 'root'
})
export class DexieService extends Dexie {
    syncQueue!: Table<OfflineRequest, number>;
    user_session!: Table<any, string>;
    grupos!: Table<any, number>;
    miembros!: Table<any, number>;
    clientes!: Table<any, number>;
    creditos!: Table<any, number>;

    constructor() {
        super('pwa-hcontrol');
        if (typeof indexedDB !== 'undefined') {
            this.version(4).stores({
                syncQueue: '++id, type, timestamp',
                user_session: 'user, token, role, lastLogin',
                grupos: '++id, clave, nombre',
                clientes: '++id, _id, nombre, apellidos',
                creditos: '++id, _id, miembro, cliente'
            });

            this.version(5).stores({
                syncQueue: '++id, type, timestamp',
                user_session: 'user, token, role, lastLogin',
                grupos: '++id, _id, clave, nombre',
                miembros: '++id, _id, grupo, nombre',
                clientes: '++id, _id, nombre, apellidos',
                creditos: '++id, _id, miembro, cliente'
            });

            this.version(6).stores({
                syncQueue: '++id, type, timestamp, status',
                user_session: 'user, token, role, lastLogin',
                grupos: '++id, _id, clave, nombre',
                miembros: '++id, _id, grupo, nombre',
                clientes: '++id, _id, nombre, apellidos',
                creditos: '++id, _id, miembro, cliente'
            });
        }

        if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.persist) {
            navigator.storage.persist().then(granted => {
                if (granted) {
                    console.log('[Dexie] Almacenamiento persistente garantizado');
                }
            }).catch(() => {});
        }
    }

    /**
     * Re-aplica sobre la tabla local de creditos aquellos pagos que estan pendientes en syncQueue
     * para evitar que una descarga fresca del servidor los borre de la vista del usuario antes de sincronizar.
     */
    async reaplicarPagosPendientes(): Promise<void> {
        try {
            const pagosPendientes = await this.syncQueue.filter(i => i.type === 'POST_PAGO' && i.status !== 'FAILED').toArray();
            for (const item of pagosPendientes) {
                const { creditoId, pagoParams } = item.data;
                if (!creditoId || !pagoParams) continue;

                const cred = await this.creditos.where('_id').equals(creditoId).first()
                    || await this.creditos.get(creditoId);

                if (cred) {
                    if (!cred.pagos) cred.pagos = [];
                    const yaEsta = cred.pagos.some((p: any) =>
                        (pagoParams.clientId && p.clientId === pagoParams.clientId) ||
                        (p.numeroRecibo && pagoParams.numeroRecibo && p.numeroRecibo === pagoParams.numeroRecibo)
                    );

                    if (!yaEsta) {
                        const montoPag = Number(pagoParams.montoPagado) || 0;
                        const montoAhorro = Number(pagoParams.montoAhorro) || 0;
                        cred.pagos.push({
                            clientId: pagoParams.clientId,
                            montoPagado: montoPag,
                            fechaPago: pagoParams.fechaPago || new Date().toISOString(),
                            numeroRecibo: pagoParams.numeroRecibo || null,
                            metodoPago: pagoParams.metodoPago || 'EFECTIVO',
                            montoAhorro: montoAhorro,
                            pagoSolidario: !!pagoParams.pagoSolidario
                        });

                        if (montoPag > 0 && cred.saldoPendiente !== undefined) {
                            cred.saldoPendiente = Math.max(0, cred.saldoPendiente - montoPag);
                        }
                        await this.creditos.put(cred);
                    }
                }
            }
        } catch (e) {
            console.warn('[Dexie] Error al reaplicar pagos pendientes:', e);
        }
    }
}