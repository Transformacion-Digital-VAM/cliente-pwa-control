import { Component, OnInit, Inject, PLATFORM_ID, ChangeDetectorRef } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { Router } from '@angular/router';
import { GrupoService } from '../../../../core/services/grupo.service';
import { NotificationService } from '../../../../core/services/notification.service';
import { forkJoin } from 'rxjs';
import { AuthService } from '../../../../core/services/auth.service';

@Component({
    selector: 'app-asesor-lista-grupos',
    standalone: true,
    imports: [CommonModule],
    templateUrl: './asesor-lista-grupos.html',
    styleUrl: './asesor-lista-grupos.css',
})
export class AsesorListaGrupos implements OnInit {
    asesorName: string = '';
    hoyStr: string = '';
    grupos: any[] = [];
    gruposResumen: { [grupoId: string]: { pagosTotal: number; saldoPendiente: number; tieneSolidarios: boolean } } = {};
    cargando: boolean = true;

    constructor(
        @Inject(PLATFORM_ID) private platformId: Object,
        private grupoService: GrupoService,
        private authService: AuthService,
        private notificationService: NotificationService,
        private router: Router,
        private cdr: ChangeDetectorRef
    ) { }

    ngOnInit(): void {
        const dias = ['Domingo', 'Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes', 'Sabado'];
        this.hoyStr = dias[new Date().getDay()];

        if (isPlatformBrowser(this.platformId)) {
            const userStr = localStorage.getItem('user');
            if (userStr) {
                try {
                    const userObj = JSON.parse(userStr);
                    this.asesorName = userObj.username || 'Asesor';
                } catch (e) {
                    this.asesorName = 'Asesor';
                }
            }
            this.cargarTodosLosGrupos();
        }
    }

    cargarTodosLosGrupos(): void {
        this.cargando = true;
        this.grupoService.getGrupos().subscribe({
            next: (grupos: any[]) => {
                this.grupos = grupos;
                // Verificar si hay grupos nuevos asignados → notificar
                this.notificationService.verificarNuevosGrupos(this.grupos);
                this.grupos.forEach(g => {
                    this.gruposResumen[g._id] = { pagosTotal: 0, saldoPendiente: 0, tieneSolidarios: false };
                });

                forkJoin({
                    miembrosAll: this.grupoService.getMiembros(),
                    creditosAll: this.grupoService.getCreditos()
                }).subscribe({
                    next: (res: any) => {
                        const miembros = res.miembrosAll || [];
                        const creditos = res.creditosAll.creditos || res.creditosAll || [];

                        miembros.forEach((m: any) => {
                            const grupoId = m.grupo?._id || m.grupo;
                            if (grupoId && this.gruposResumen[grupoId]) {
                                // Find credit for this member
                                const credito = creditos.find((c: any) => (c.miembro?._id === m._id) || (c.miembro === m._id));

                                if (credito) {
                                    const saldoPendiente = credito.saldoPendiente || 0;
                                    const saldoTotal = credito.saldoTotal || 0;
                                    const totalPagado = saldoTotal - saldoPendiente;

                                    this.gruposResumen[grupoId].saldoPendiente += saldoPendiente;
                                    this.gruposResumen[grupoId].pagosTotal += totalPagado;

                                    // Check solidario
                                    const tieneSolidario = credito.pagos && credito.pagos.some((p: any) => p.pagoSolidario === true);
                                    if (tieneSolidario) {
                                        this.gruposResumen[grupoId].tieneSolidarios = true;
                                    }
                                }
                            }
                        });
                        this.cargando = false;
                        this.cdr.detectChanges();
                    },
                    error: (err) => {
                        console.error('Error al obtener miembros y creditos:', err);
                        this.cargando = false;
                        this.cdr.detectChanges();
                    }
                });
            },
            error: (err) => {
                console.error('Error al obtener grupos:', err);
                this.cargando = false;
                this.cdr.detectChanges();
            }
        });
    }

    verDetalleGrupo(grupoId: string): void {
        this.router.navigate(['/hoja-control-asesor', grupoId]);
    }

    volver(): void {
        this.router.navigate(['/home-asesor']);
    }

    irAInicio(): void {
        this.router.navigate(['/home-asesor']);
    }

    logout(): void {
        this.authService.logout();
        this.router.navigate(['/login']);
    }
}
