import { Injectable } from '@angular/core';
import Dexie, { Table } from 'dexie';

export interface OfflineRequest {
    id?: number;
    type: string;
    data: any;
    timestamp: number;
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
        }

    }
}