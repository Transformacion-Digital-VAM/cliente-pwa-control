import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { DexieService } from '../../core/database/dexie.service';
import { from, firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';

@Injectable({
    providedIn: 'root'
})
export class AuthService {
    private apiUrl = `${environment.apiUrl}/users`;

    constructor(private http: HttpClient, private dexie: DexieService) { }

    async login(credentials: any) {
        if (navigator.onLine) {
            try {
                const response: any = await firstValueFrom(
                    // this.http.post('http://localhost:3000/api/users/login', credentials)
                    this.http.post(`${this.apiUrl}/login`, credentials)
                );
                console.log('[AuthService] Login exitoso, guardando sesión en Dexie');
                
                // Persistimos sesión para uso offline futuro
                const sessionData = {
                    id: response.user.id || response.user._id,
                    user: credentials.user,
                    role: response.user.role,
                    token: response.token,
                    lastLogin: Date.now(),
                    username: response.user.username || credentials.user,
                    nombre: response.user.nombre,
                    coordinacion: response.user.coordinacion
                };
                
                try {
                    await this.dexie.user_session.put(sessionData);
                    console.log('[AuthService] Sesión guardada correctamente en Dexie:', sessionData.user);
                } catch (dexieError) {
                    console.error('[AuthService] Error guardando en Dexie:', dexieError);
                }
                
                localStorage.setItem('isLoggedIn', 'true');
                localStorage.setItem('userRole', response.user.role);
                localStorage.setItem('user', JSON.stringify({ 
                    id: response.user.id || response.user._id,
                    username: response.user.username || credentials.user,
                    nombre: response.user.nombre,
                    coordinacion: response.user.coordinacion
                }));
                return response;
            } catch (error) {
                console.error('[AuthService] Error en login online:', error);
                return this.attemptOfflineLogin(credentials.user);
            }
        } else {
            return this.attemptOfflineLogin(credentials.user);
        }
    }

    private async saveOffline(data: any) {
        await this.dexie.syncQueue.add({
            type: 'REGISTER',
            data: data,
            timestamp: Date.now()
        });
        return { message: 'Guardado localmente. Se enviará al detectar internet.' };
    }


    private async attemptOfflineLogin(user: string) {
        const localUser = await this.dexie.user_session.get(user);
        if (localUser) return { ...localUser, isOffline: true };
        throw new Error('No hay sesión local');
    }

    async logout() {
        localStorage.removeItem('isLoggedIn');
        localStorage.removeItem('userRole');
        localStorage.removeItem('loginDate');
        await this.dexie.user_session.clear();
    }
}

export { DexieService };
