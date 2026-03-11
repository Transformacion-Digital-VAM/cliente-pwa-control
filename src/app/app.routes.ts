import { Routes } from '@angular/router';
import { LoginComponent } from './modules/auth/login/login';
import { AdminHojaControl } from './modules/admin/components/admin-hoja-control/admin-hoja-control';
import { AsesorHojaControl } from './modules/asesor/components/asesor-hoja-control/asesor-hoja-control';
import { AdminHome } from './modules/admin/components/admin-home/admin-home';
import { AsesorHome } from './modules/asesor/components/asesor-home/asesor-home';
import { AsesorListaGrupos } from './modules/asesor/components/asesor-lista-grupos/asesor-lista-grupos';
import { AdminHojaControlInd } from './modules/admin/components/admin-hoja-control-ind/admin-hoja-control-ind';
import { roleGuard, noAuthGuard } from './core/guards/auth.guard';


export const routes: Routes = [
    { path: '', redirectTo: 'login', pathMatch: 'full' },
    { path: 'login', component: LoginComponent, canActivate: [noAuthGuard] },
    { path: 'hoja-control-admin', component: AdminHojaControl, canActivate: [roleGuard(['admin'])] },
    { path: 'hoja-control-admin-ind', component: AdminHojaControlInd, canActivate: [roleGuard(['admin'])] },
    { path: 'hoja-control-asesor/:id', component: AsesorHojaControl, canActivate: [roleGuard(['user', 'asesor'])] },
    { path: 'home-admin', component: AdminHome, canActivate: [roleGuard(['admin'])] },
    { path: 'home-asesor', component: AsesorHome, canActivate: [roleGuard(['user', 'asesor'])] },
    { path: 'grupos-asesor', component: AsesorListaGrupos, canActivate: [roleGuard(['user', 'asesor'])] },
    { path: '**', redirectTo: 'login' }
];
