import { HttpInterceptorFn, HttpErrorResponse } from '@angular/common/http';
import { inject, PLATFORM_ID } from '@angular/core';
import { Router } from '@angular/router';
import { isPlatformBrowser } from '@angular/common';
import { DexieService } from '../database/dexie.service';
import { from, switchMap, of, throwError } from 'rxjs';
import { catchError, timeout } from 'rxjs/operators';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
    const platformId = inject(PLATFORM_ID);
    if (!isPlatformBrowser(platformId)) {
        return next(req);
    }
    const dexie = inject(DexieService);
    const router = inject(Router);

    let activeUsername: string | null = null;
    try {
        const userStr = localStorage.getItem('user');
        if (userStr) {
            const parsed = JSON.parse(userStr);
            if (parsed && typeof parsed.username === 'string' && parsed.username.trim().length > 0) {
                activeUsername = parsed.username.trim();
            } else {
                console.warn('[AuthInterceptor] activeUsername not valid, using last-login fallback');
            }
        }
    } catch (e) {
        console.warn('[AuthInterceptor] Error parsing user from localStorage:', e);
    }

    const fallbackSession = () =>
        dexie.user_session.orderBy('lastLogin').reverse().first().catch(() => null);

    const sessionPromise = activeUsername
        ? dexie.user_session.get(activeUsername)
              .then((session) => session || fallbackSession())
              .catch((err) => {
                  console.warn('[AuthInterceptor] activeUsername lookup failed, using last-login fallback:', err);
                  return fallbackSession();
              })
        : fallbackSession();

    return from(sessionPromise).pipe(
        timeout(5000), // 5 segundo timeout para evitar bloqueos
        catchError((err) => {
            console.warn('[AuthInterceptor] Could not get session from Dexie, continuing without token:', err);
            return of(null);
        }),
        switchMap((session: any) => {
            if (session && session.token) {
                console.debug('[AuthInterceptor] Token found, adding to Authorization header');
                const cloned = req.clone({
                    setHeaders: { Authorization: `Bearer ${session.token}` }
                });
                return next(cloned).pipe(
                    catchError((err: HttpErrorResponse) => {
                        if (err.status === 401 && !req.url.includes('/login')) {
                            console.warn('[AuthInterceptor] Sesión expirada o token inválido (401). Redirigiendo a /login...');
                            localStorage.removeItem('isLoggedIn');
                            localStorage.removeItem('userRole');
                            if (!window.location.pathname.includes('/login')) {
                                router.navigate(['/login']);
                            }
                        }
                        return throwError(() => err);
                    })
                );
            }
            console.warn('[AuthInterceptor] No session or token found, request will be sent without auth header');
            return next(req);
        })
    );
};