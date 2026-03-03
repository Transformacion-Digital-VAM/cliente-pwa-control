import { Routes } from '@angular/router';
import { LoginComponent } from './modules/auth/login/login';
import { AdminHojaControl } from './modules/admin/components/admin-hoja-control/admin-hoja-control';
import { AsesorHojaControl } from './modules/asesor/components/asesor-hoja-control/asesor-hoja-control';
import { AdminHome } from './modules/admin/components/admin-home/admin-home';
import { AsesorHome } from './modules/asesor/components/asesor-home/asesor-home';


export const routes: Routes = [
    { path: '', redirectTo: 'login', pathMatch: 'full' },
    { path: 'login', component: LoginComponent },
    { path: 'hoja-control-admin', component: AdminHojaControl },
    { path: 'hoja-control-asesor', component: AsesorHojaControl },
    { path: 'home-admin', component: AdminHome },
    { path: 'home-asesor', component: AsesorHome },
    { path: '**', redirectTo: 'login' }
];
