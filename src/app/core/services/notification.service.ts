// import { Injectable, Inject, PLATFORM_ID } from '@angular/core';
// import { isPlatformBrowser } from '@angular/common';

// @Injectable({
//     providedIn: 'root'
// })
// export class NotificationService {
//     private permissionGranted = false;
//     private timerDiarioId: any = null;
//     private timersRecordatorios: any[] = [];

//     constructor(@Inject(PLATFORM_ID) private platformId: Object) {
//         if (isPlatformBrowser(this.platformId)) {
//             this.solicitarPermiso();
//         }
//     }

//     /**
//      * Solicita permiso al usuario para mostrar notificaciones del navegador.
//      */
//     solicitarPermiso(): void {
//         if (!('Notification' in window)) {
//             console.warn('[NotificationService] Este navegador no soporta Notifications API.');
//             return;
//         }

//         if (Notification.permission === 'granted') {
//             this.permissionGranted = true;
//         } else if (Notification.permission !== 'denied') {
//             Notification.requestPermission().then(permission => {
//                 this.permissionGranted = permission === 'granted';
//             });
//         }
//     }

//     /**
//      * Muestra una notificación nativa del navegador.
//      */
//     // mostrar(titulo: string, opciones?: NotificationOptions): void {
//     //     if (!isPlatformBrowser(this.platformId)) return;

//     //     if (!('Notification' in window)) return;

//     //     if (Notification.permission === 'granted') {
//     //         const notif = new Notification(titulo, {
//     //             icon: '/icons/android-chrome-192x192.png',
//     //             badge: '/icons/favicon-32x32.png',
//     //             ...opciones
//     //         });
//     //         // Cerrar automáticamente después de 7 segundos
//     //         setTimeout(() => notif.close(), 7000);
//     //     } else if (Notification.permission !== 'denied') {
//     //         // Reintentar pedir permiso
//     //         Notification.requestPermission().then(permission => {
//     //             if (permission === 'granted') {
//     //                 this.permissionGranted = true;
//     //                 this.mostrar(titulo, opciones);
//     //             }
//     //         });
//     //     }
//     // }
//     mostrar(titulo: string, opciones?: NotificationOptions): void {
//         if (!isPlatformBrowser(this.platformId)) return;
//         if (!('Notification' in window)) return;

//         if (Notification.permission === 'granted') {
//             // REVISAR SI EXISTE SERVICE WORKER (Para móviles)
//             if ('serviceWorker' in navigator) {
//                 navigator.serviceWorker.ready.then(registration => {
//                     registration.showNotification(titulo, {
//                         icon: '/icons/android-chrome-192x192.png',
//                         badge: '/icons/favicon-32x32.png',
//                         ...opciones
//                     });
//                 });
//             } else {
//                 // Fallback para navegadores antiguos o laptops sin SW
//                 new Notification(titulo, opciones);
//             }
//         }
//     }



//     // ─── Lógica de detección para Asesor ───
//     /**
//      * Compara la lista de grupos actual con la almacenada localmente.
//      * Si hay grupos nuevos, lanza una notificación por cada uno.
//      */
//     verificarNuevosGrupos(gruposActuales: any[]): void {
//         if (!isPlatformBrowser(this.platformId)) return;

//         const key = 'notif_grupos_conocidos';
//         const idsActuales = gruposActuales.map((g: any) => g._id);

//         const conocidosStr = localStorage.getItem(key);
//         const idsConocidos: string[] = conocidosStr ? JSON.parse(conocidosStr) : [];

//         if (idsConocidos.length > 0) {
//             const nuevos = gruposActuales.filter((g: any) => !idsConocidos.includes(g._id));
//             nuevos.forEach((g: any) => {
//                 this.mostrar('Nuevo grupo asignado', {
//                     body: `Se te ha asignado el grupo "${g.nombre || g.clave || 'Sin nombre'}"`,
//                     tag: `nuevo-grupo-${g._id}`
//                 });
//             });
//         }

//         // Actualizar la lista almacenada
//         localStorage.setItem(key, JSON.stringify(idsActuales));
//     }


//     // ─── Lógica de detección para Admin ───
//     /**
//      * Compara los saldos pendientes actuales con los almacenados.
//      * Si un grupo que antes tenía saldo ahora tiene 0, notifica.
//      */
//     verificarHojasCompletadas(grupos: any[], creditos: any[], miembros: any[]): void {
//         if (!isPlatformBrowser(this.platformId)) return;

//         const key = 'notif_saldos_grupos';

//         // Calcular saldo pendiente por grupo
//         const saldosPorGrupo: { [grupoId: string]: { nombre: string, saldo: number } } = {};

//         grupos.forEach((g: any) => {
//             saldosPorGrupo[g._id] = { nombre: g.nombre || g.clave || 'Sin nombre', saldo: 0 };
//         });

//         miembros.forEach((m: any) => {
//             const grupoId = m.grupo?._id || m.grupo;
//             if (grupoId && saldosPorGrupo[grupoId] !== undefined) {
//                 const credito = creditos.find((c: any) =>
//                     (c.miembro?._id === m._id) || (c.miembro === m._id)
//                 );
//                 if (credito) {
//                     saldosPorGrupo[grupoId].saldo += (credito.saldoPendiente || 0);
//                 }
//             }
//         });

//         // Comparar con almacenados
//         const prevStr = localStorage.getItem(key);
//         const prevSaldos: { [grupoId: string]: number } = prevStr ? JSON.parse(prevStr) : {};

//         if (Object.keys(prevSaldos).length > 0) {
//             Object.entries(saldosPorGrupo).forEach(([grupoId, info]) => {
//                 const saldoAnterior = prevSaldos[grupoId];
//                 // Si antes tenía saldo > 0 y ahora es 0 → completado
//                 if (saldoAnterior !== undefined && saldoAnterior > 0 && info.saldo === 0) {
//                     this.mostrar('Hoja de control completada', {
//                         body: `El grupo "${info.nombre}" ha sido liquidado completamente. Sin saldo pendiente.`,
//                         tag: `hoja-completa-${grupoId}`
//                     });
//                 }
//             });
//         }

//         // Actualizar almacenamiento
//         const nuevosSaldos: { [grupoId: string]: number } = {};
//         Object.entries(saldosPorGrupo).forEach(([grupoId, info]) => {
//             nuevosSaldos[grupoId] = info.saldo;
//         });
//         localStorage.setItem(key, JSON.stringify(nuevosSaldos));
//     }


//     // ─── Notificación programada diaria para Asesor ───
//     /**
//      * Programa una notificación a las 9:15 AM con el resumen del día.
//      * Si ya pasaron las 9:15, se programa para el día siguiente.
//      * Recibe la cantidad de grupos del día para incluirla en el mensaje.
//      */
//     programarNotificacionDiaria(gruposDelDia: number, clientesDelDia: number = 0): void {
//         if (!isPlatformBrowser(this.platformId)) return;

//         // Cancelar timer previo si existe
//         if (this.timerDiarioId) {
//             clearTimeout(this.timerDiarioId);
//             this.timerDiarioId = null;
//         }

//         const ahora = new Date();
//         const hoy = `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, '0')}-${String(ahora.getDate()).padStart(2, '0')}`;

//         // Verificar si ya se envió hoy
//         const keyEnviado = 'notif_diaria_enviada';
//         const ultimoEnvio = localStorage.getItem(keyEnviado);

//         if (ultimoEnvio === hoy) {
//             // Ya se notificó, no programar de nuevo
//             return;
//         }

//         // Calcular las 9:15 AM 
//         const target = new Date();
//         target.setHours(9, 15, 0, 0);

//         let delay = target.getTime() - ahora.getTime();

//         if (delay <= 0) {
//             // Ya pasaron las 9:15 am
//             // Si el asesor abre la app después de las 9:15 y no se notificó hoy,
//             // enviamos inmediatamente (con 3s de delay para que cargue bien la UI)
//             delay = 3000;
//         }

//         // Guardar las cantidades para usarlas cuando se dispare el timer
//         const gruposCount = gruposDelDia;
//         const clientesCount = clientesDelDia;

//         this.timerDiarioId = setTimeout(() => {
//             // Re-verificar que no se haya enviado (por si abrió otra pestaña)
//             const yaEnviado = localStorage.getItem(keyEnviado);
//             const hoyCheck = new Date();
//             const hoyStr = `${hoyCheck.getFullYear()}-${String(hoyCheck.getMonth() + 1).padStart(2, '0')}-${String(hoyCheck.getDate()).padStart(2, '0')}`;

//             if (yaEnviado === hoyStr) return;

//             let mensaje = '';
//             if (gruposCount > 0 || clientesCount > 0) {
//                 const partes = [];
//                 if (gruposCount > 0) partes.push(`${gruposCount} grupo${gruposCount > 1 ? 's' : ''}`);
//                 if (clientesCount > 0) partes.push(`${clientesCount} cliente${clientesCount > 1 ? 's' : ''}`);
//                 mensaje = `Hoy tienes ${partes.join(' y ')} por visitar. ¡Buen día de trabajo!`;
//             } else {
//                 mensaje = 'No tienes grupos ni clientes individuales programados para hoy.';
//             }

//             this.mostrar('Resumen del día', {
//                 body: mensaje,
//                 tag: 'resumen-diario'
//             });

//             localStorage.setItem(keyEnviado, hoyStr);
//         }, delay);
//     }

//     /**
//      * Limpia todos los timers programados.
//      */
//     limpiarTimerDiario(): void {
//         if (this.timerDiarioId) {
//             clearTimeout(this.timerDiarioId);
//             this.timerDiarioId = null;
//         }
//         this.timersRecordatorios.forEach(t => clearTimeout(t));
//         this.timersRecordatorios = [];
//     }


//     // ─── Recordatorio 10 min antes de la visita ───
//     /**
//      * Programa una notificación 10 minutos antes de la hora de visita
//      * para cada grupo del día. El campo horaVisita puede venir como
//      * "09:00", "9:00", "14:30", etc.
//      */
//     programarRecordatoriosVisita(gruposDelDia: any[]): void {
//         if (!isPlatformBrowser(this.platformId)) {
//             return;
//         }

//         // Limpiar recordatorios previos
//         this.timersRecordatorios.forEach(t => clearTimeout(t));
//         this.timersRecordatorios = [];

//         const ahora = new Date();
//         const hoy = `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, '0')}-${String(ahora.getDate()).padStart(2, '0')}`;
//         const keyRecordatorios = 'notif_recordatorios_enviados';
//         const enviadosStr = localStorage.getItem(keyRecordatorios);
//         const enviados: { [grupoId: string]: string } = enviadosStr ? JSON.parse(enviadosStr) : {};

//         gruposDelDia.forEach((grupo: any) => {
//             if (!grupo.horaVisita || !grupo._id) {
//                 return;
//             }

//             // Si ya se envió el recordatorio hoy para este grupo, saltar
//             if (enviados[grupo._id] === hoy) {
//                 return;
//             }

//             // Parsear horaVisita (formato "HH:mm" o "H:mm")
//             const partes = grupo.horaVisita.split(':');
//             if (partes.length < 2) {
//                 return;
//             }

//             const horaVisita = parseInt(partes[0], 10);
//             const minVisita = parseInt(partes[1], 10);
//             if (isNaN(horaVisita) || isNaN(minVisita)) {
//                 return;
//             }

//             // Calcular el momento 10 minutos antes de la visita
//             const targetDate = new Date();
//             targetDate.setHours(horaVisita, minVisita, 0, 0);
//             const recordatorioMs = targetDate.getTime() - (10 * 60 * 1000); // 10 min antes

//             const delay = recordatorioMs - ahora.getTime();

//             if (delay > 0) {
//                 // La hora de recordatorio aún no ha pasado → programar
//                 const timerId = setTimeout(() => {
//                     this.mostrar('Recordatorio de visita', {
//                         body: `En 10 minutos tienes visita al grupo "${grupo.nombre || grupo.clave}" (${grupo.horaVisita})`,
//                         tag: `recordatorio-${grupo._id}`
//                     });
//                     // Marcar como enviado
//                     const envStr = localStorage.getItem(keyRecordatorios);
//                     const env = envStr ? JSON.parse(envStr) : {};
//                     env[grupo._id] = hoy;
//                     localStorage.setItem(keyRecordatorios, JSON.stringify(env));
//                 }, delay);

//                 this.timersRecordatorios.push(timerId);
//             }
//         });
//     }
// }



import { Injectable, Inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { SwPush } from '@angular/service-worker';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';

@Injectable({
    providedIn: 'root'
})
export class NotificationService {
    private permissionGranted = false;
    private timerDiarioId: any = null;
    private timersRecordatorios: any[] = [];

    // Reemplaza con tu llave pública generada (VAPID)
    readonly VAPID_PUBLIC_KEY = "BPezTC8hHNVQ3XKGQKF7eYdpeUj-b7MEG24sS5gk6VrGqFg_dQVR0VKLNPV16R5G0pONG64dkH3zjXwpcJrnQeg";

    constructor(
        @Inject(PLATFORM_ID) private platformId: Object,
        private swPush: SwPush,
        private http: HttpClient
    ) {
        if (isPlatformBrowser(this.platformId)) {
            this.solicitarPermiso();
            // Si el Service Worker está habilitado, inicializamos la suscripción Push real
            if (this.swPush.isEnabled) {
                this.inicializarSuscripciónPush();
            }
        }
    }

    /**
     * Inicializa la suscripción Push para recibir mensajes del servidor
     * incluso con la app cerrada.
     */
    private async inicializarSuscripciónPush() {
        try {
            const subscription = await this.swPush.requestSubscription({
                serverPublicKey: this.VAPID_PUBLIC_KEY
            });

            // Enviamos la suscripción a tu API para guardarla en la base de datos
            this.http.post(`${environment.apiUrl}/notificaciones/subscribe`, subscription).subscribe({
                next: () => console.log('[NotificationService] Suscripción Push guardada en servidor.'),
                error: (err) => console.error('[NotificationService] Error al guardar suscripción:', err)
            });
        } catch (err) {
            console.error('[NotificationService] No se pudo suscribir a Push:', err);
        }
    }

    solicitarPermiso(): void {
        if (!('Notification' in window)) {
            console.warn('[NotificationService] Este navegador no soporta Notifications API.');
            return;
        }

        if (Notification.permission === 'granted') {
            this.permissionGranted = true;
        } else if (Notification.permission !== 'denied') {
            Notification.requestPermission().then(permission => {
                this.permissionGranted = permission === 'granted';
            });
        }
    }

    /**
     * Muestra una notificación utilizando el Service Worker (necesario para Android/PWA)
     */
    async mostrar(titulo: string, opciones?: NotificationOptions): Promise<void> {
        if (!isPlatformBrowser(this.platformId)) return;

        if (Notification.permission === 'granted') {
            const registration = await navigator.serviceWorker.ready;

            // Creamos un objeto de opciones extendido para evitar el error de TS
            const androidOptions: any = {
                icon: '/icons/android-chrome-192x192.png',
                badge: '/icons/favicon-32x32.png',
                vibrate: [200, 100, 200], // Patrón de vibración: vibra, para, vibra
                ...opciones
            };
            // Usamos el objeto extendido aquí
            registration.showNotification(titulo, androidOptions);
        }
    }

    // ─── Lógica para Asesor ───
    // verificarNuevosGrupos(gruposActuales: any[]): void {
    //     if (!isPlatformBrowser(this.platformId)) return;

    //     const key = 'notif_grupos_conocidos';
    //     const idsActuales = gruposActuales.map((g: any) => g._id);
    //     const conocidosStr = localStorage.getItem(key);
    //     const idsConocidos: string[] = conocidosStr ? JSON.parse(conocidosStr) : [];

    //     if (idsConocidos.length > 0) {
    //         const nuevos = gruposActuales.filter((g: any) => !idsConocidos.includes(g._id));
    //         nuevos.forEach((g: any) => {
    //             this.mostrar('Nuevo grupo asignado', {
    //                 body: `Se te ha asignado el grupo "${g.nombre || g.clave || 'Sin nombre'}"`,
    //                 tag: `nuevo-grupo-${g._id}`
    //             });
    //         });
    //     }
    //     localStorage.setItem(key, JSON.stringify(idsActuales));
    // }
    // ─── LÓGICA PARA ASESOR ───
    verificarNuevosGrupos(gruposActuales: any[]): void {
        if (!isPlatformBrowser(this.platformId) || !gruposActuales.length) return;

        const key = 'notif_grupos_conocidos';
        const idsActuales = gruposActuales.map((g: any) => g._id);
        const conocidosStr = localStorage.getItem(key);

        if (!conocidosStr) {
            localStorage.setItem(key, JSON.stringify(idsActuales));
            return;
        }

        const idsConocidos: string[] = JSON.parse(conocidosStr);

        // 1. Primero filtramos los que no están en el localStorage
        const nuevos = gruposActuales.filter((g: any) => !idsConocidos.includes(g._id));

        // 2. Insertamos tus líneas aquí para filtrar solo los de hoy
        const hoy = new Date().toISOString().split('T')[0];
        const nuevosHoy = nuevos.filter(g => g.createdAt && g.createdAt.includes(hoy));

        // 3. Notificamos usando 'nuevosHoy' en lugar de 'nuevos'
        if (nuevosHoy.length > 0) {
            nuevosHoy.forEach((g: any) => {
                this.mostrar('Nuevo grupo asignado', {
                    body: `Se te ha asignado el grupo "${g.nombre || g.clave || 'Sin nombre'}"`,
                    tag: `nuevo-grupo-${g._id}`,
                    silent: false
                } as any);
            });

            // Siempre guardamos los IDs actuales para mantener sincronizado el localStorage
            localStorage.setItem(key, JSON.stringify(idsActuales));
        }
    }

    // ─── Lógica para Admin ───
    verificarHojasCompletadas(grupos: any[], creditos: any[], miembros: any[]): void {
        if (!isPlatformBrowser(this.platformId)) return;

        const key = 'notif_saldos_grupos';
        const saldosPorGrupo: { [grupoId: string]: { nombre: string, saldo: number } } = {};

        grupos.forEach((g: any) => {
            saldosPorGrupo[g._id] = { nombre: g.nombre || g.clave || 'Sin nombre', saldo: 0 };
        });

        miembros.forEach((m: any) => {
            const grupoId = m.grupo?._id || m.grupo;
            if (grupoId && saldosPorGrupo[grupoId] !== undefined) {
                const credito = creditos.find((c: any) => (c.miembro?._id === m._id) || (c.miembro === m._id));
                if (credito) {
                    saldosPorGrupo[grupoId].saldo += (credito.saldoPendiente || 0);
                }
            }
        });

        const prevStr = localStorage.getItem(key);
        const prevSaldos: { [grupoId: string]: number } = prevStr ? JSON.parse(prevStr) : {};

        if (Object.keys(prevSaldos).length > 0) {
            Object.entries(saldosPorGrupo).forEach(([grupoId, info]) => {
                const saldoAnterior = prevSaldos[grupoId];
                if (saldoAnterior !== undefined && saldoAnterior > 0 && info.saldo === 0) {
                    this.mostrar('Hoja de control completada', {
                        body: `El grupo "${info.nombre}" ha sido liquidado completamente.`,
                        tag: `hoja-completa-${grupoId}`
                    });
                }
            });
        }

        const nuevosSaldos: { [grupoId: string]: number } = {};
        Object.entries(saldosPorGrupo).forEach(([grupoId, info]) => { nuevosSaldos[grupoId] = info.saldo; });
        localStorage.setItem(key, JSON.stringify(nuevosSaldos));
    }

    // ─── Programación Diaria ───
    programarNotificacionDiaria(gruposDelDia: number, clientesDelDia: number = 0, fichasNoCerradas: number = 0): void {
        if (!isPlatformBrowser(this.platformId)) return;

        if (this.timerDiarioId) clearTimeout(this.timerDiarioId);

        const ahora = new Date();
        const hoy = ahora.toISOString().split('T')[0];
        const keyEnviado = 'notif_diaria_enviada';

        if (localStorage.getItem(keyEnviado) === hoy) return;

        const target = new Date();
        target.setHours(9, 15, 0, 0);

        let delay = target.getTime() - ahora.getTime();
        if (delay <= 0) delay = 3000; // Si ya pasó, mostrar a los 3 segundos de abrir la app

        this.timerDiarioId = setTimeout(() => {
            if (localStorage.getItem(keyEnviado) === hoy) return;

            let mensaje = '';
            if (gruposDelDia > 0 || clientesDelDia > 0) {
                mensaje = `Hoy tienes ${gruposDelDia} grupos y ${clientesDelDia} clientes por visitar.`;
            } else {
                mensaje = 'No tienes visitas programadas para hoy.';
            }

            if (fichasNoCerradas > 0) {
                mensaje += ` ATENCIÓN: Tienes ${fichasNoCerradas} ficha(s) sin cerrar, las cuales se marcan como atrasos.`;
            }

            this.mostrar('Resumen del día', { body: mensaje, tag: 'resumen-diario' });
            localStorage.setItem(keyEnviado, hoy);
        }, delay);
    }

    // ─── Recordatorios 10 min antes ───
    programarRecordatoriosVisita(gruposDelDia: any[]): void {
        if (!isPlatformBrowser(this.platformId)) return;

        this.timersRecordatorios.forEach(t => clearTimeout(t));
        this.timersRecordatorios = [];

        const ahora = new Date();
        const hoy = ahora.toISOString().split('T')[0];
        const keyRecordatorios = 'notif_recordatorios_enviados';
        const enviados: { [grupoId: string]: string } = JSON.parse(localStorage.getItem(keyRecordatorios) || '{}');

        gruposDelDia.forEach((grupo: any) => {
            if (!grupo.horaVisita || !grupo._id || enviados[grupo._id] === hoy) return;

            const [hora, min] = grupo.horaVisita.split(':').map(Number);
            const targetDate = new Date();
            targetDate.setHours(hora, min, 0, 0);

            const recordatorioMs = targetDate.getTime() - (10 * 60 * 1000);
            const delay = recordatorioMs - ahora.getTime();

            if (delay > 0) {
                const timerId = setTimeout(() => {
                    this.mostrar('Recordatorio de visita', {
                        body: `En 10 minutos visitas al grupo "${grupo.nombre || grupo.clave}" (${grupo.horaVisita})`,
                        tag: `recordatorio-${grupo._id}`
                    });
                    const env = JSON.parse(localStorage.getItem(keyRecordatorios) || '{}');
                    env[grupo._id] = hoy;
                    localStorage.setItem(keyRecordatorios, JSON.stringify(env));
                }, delay);
                this.timersRecordatorios.push(timerId);
            }
        });
    }

    limpiarTimerDiario(): void {
        if (this.timerDiarioId) clearTimeout(this.timerDiarioId);
        this.timersRecordatorios.forEach(t => clearTimeout(t));
        this.timersRecordatorios = [];
    }
}