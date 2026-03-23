import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { DexieService } from '../database/dexie.service';
import { from, switchMap, of } from 'rxjs';
import { catchError } from 'rxjs/operators';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
    const dexie = inject(DexieService);

    let activeUsername = null;
    try {
        const userStr = localStorage.getItem('user');
        if (userStr) {
            activeUsername = JSON.parse(userStr).username;
        }
    } catch (e) {}

    let sessionPromise;
    if (activeUsername) {
        sessionPromise = dexie.user_session.get(activeUsername);
    } else {
        sessionPromise = dexie.user_session.orderBy('lastLogin').reverse().first().catch(() => null);
    }

    return from(sessionPromise).pipe(
        catchError((err) => {
            console.error('[AuthInterceptor] Dexie error:', err);
            return of(null);
        }),
        switchMap((session: any) => {
            if (session && session.token) {
                const cloned = req.clone({
                    setHeaders: { Authorization: `Bearer ${session.token}` }
                });
                return next(cloned);
            }
            return next(req);
        })
    );
};