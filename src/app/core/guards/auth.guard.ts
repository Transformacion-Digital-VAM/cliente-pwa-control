import { inject } from '@angular/core';
import { Router, CanActivateFn } from '@angular/router';

export const roleGuard = (allowedRoles: string[]): CanActivateFn => {
    return () => {
        const router = inject(Router);

        if (typeof localStorage === 'undefined') return true;

        const isLoggedIn = localStorage.getItem('isLoggedIn') === 'true';
        const userRole = localStorage.getItem('userRole');

        if (!isLoggedIn || !userRole) {
            return router.createUrlTree(['/login']);
        }

        if (allowedRoles.includes(userRole)) {
            return true;
        }

        if (userRole === 'admin') {
            return router.createUrlTree(['/home-admin']);
        } else if (userRole === 'user' || userRole === 'asesor') {
            return router.createUrlTree(['/home-asesor']);
        }

        return router.createUrlTree(['/login']);
    };
};

export const noAuthGuard: CanActivateFn = () => {
    const router = inject(Router);
    if (typeof localStorage === 'undefined') return true;

    const isLoggedIn = localStorage.getItem('isLoggedIn') === 'true';
    const userRole = localStorage.getItem('userRole');

    if (isLoggedIn && userRole) {
        if (userRole === 'admin') {
            return router.createUrlTree(['/home-admin']);
        } else if (userRole === 'user' || userRole === 'asesor') {
            return router.createUrlTree(['/home-asesor']);
        }
    }
    return true;
};
