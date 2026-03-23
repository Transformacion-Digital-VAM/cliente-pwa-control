import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { DexieService } from '../../core/database/dexie.service';
import { from, firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';

@Injectable({
    providedIn: 'root'
})
export class AuthService {
    // private apiUrl = 'http://localhost:3000/api/users';
    // private apiUrl = 'http://192.168.1.237:3000/api/users';
    private apiUrl = `${environment.apiUrl}/users`;

    constructor(private http: HttpClient, private dexie: DexieService) { }

    async login(credentials: any) {
        if (navigator.onLine) {
            try {
                const response: any = await firstValueFrom(
                    // this.http.post('http://localhost:3000/api/users/login', credentials)
                    this.http.post(`${this.apiUrl}/login`, credentials)
                );
                // Persistimos sesión para uso offline futuro
                await this.dexie.user_session.put({
                    user: credentials.user,
                    role: response.user.role,
                    token: response.token,
                    lastLogin: Date.now()
                });
                localStorage.setItem('isLoggedIn', 'true');
                localStorage.setItem('userRole', response.user.role);
                localStorage.setItem('user', JSON.stringify({ username: response.user.username || credentials.user }));
                return response;
            } catch (error) {
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
        await this.dexie.user_session.clear();
    }
}

export { DexieService };
