import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { DexieService } from '../database/dexie.service';
import { from, switchMap } from 'rxjs';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
    const dexie = inject(DexieService);

    // Recuperamos el último token guardado en Dexie
    return from(dexie.user_session.toCollection().last()).pipe(
        switchMap(session => {
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