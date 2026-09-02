import { Component, OnInit, Inject, PLATFORM_ID, ChangeDetectorRef, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { GrupoService } from '../../../../core/services/grupo.service';
import { NotificationService } from '../../../../core/services/notification.service';
import { forkJoin } from 'rxjs';
import { AuthService } from '../../../../core/services/auth.service';

@Component({
    selector: 'app-asesor-lista-grupos',
    standalone: true,
    imports: [CommonModule, FormsModule],
    templateUrl: './asesor-lista-grupos.html',
    styleUrl: './asesor-lista-grupos.css',
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class AsesorListaGrupos implements OnInit {
    asesorName: string = '';
    hoyStr: string = '';
    grupos: any[] = [];
    gruposResumen: { [grupoId: string]: { pagosTotal: number; saldoPendiente: number; tieneSolidarios: boolean; sinPagosAtrasados: boolean } } = {};
    cargando: boolean = true;
    searchTerm: string = '';

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
                    this.asesorName = userObj.nombre || userObj.username || 'Asesor';
                } catch (e) {
                    this.asesorName = 'Asesor';
                }
            }
            this.cargarTodosLosGrupos();
        }
    }

    paginaActual: number = 1;
    itemsPorPagina: number = 6;

    get totalPaginas(): number {
        return Math.ceil(this.gruposFiltrados.length / this.itemsPorPagina) || 1;
    }

    get gruposPaginados(): any[] {
        const inicio = (this.paginaActual - 1) * this.itemsPorPagina;
        return this.gruposFiltrados.slice(inicio, inicio + this.itemsPorPagina);
    }

    setPagina(pag: number): void {
        if (pag >= 1 && pag <= this.totalPaginas) {
            this.paginaActual = pag;
            this.cdr.markForCheck();
        }
    }

    onSearchChange(): void {
        this.paginaActual = 1;
        this.cdr.markForCheck();
    }

    getArrayPaginas(total: number): number[] {
        return Array.from({ length: total }, (_, i) => i + 1);
    }

    get gruposFiltrados(): any[] {
        if (!this.searchTerm || !this.searchTerm.trim()) {
            return this.grupos;
        }
        const term = this.searchTerm.toLowerCase().trim();
        return this.grupos.filter(g =>
            (g.nombre && g.nombre.toLowerCase().includes(term)) ||
            (g.clave && g.clave.toLowerCase().includes(term)) ||
            (g.diaVisita && g.diaVisita.toLowerCase().includes(term))
        );
    }

    cargarTodosLosGrupos(): void {
        this.cargando = true;
        this.cdr.markForCheck();

        forkJoin({
            grupos: this.grupoService.getGrupos(),
            miembrosAll: this.grupoService.getMiembros(),
            creditosAll: this.grupoService.getCreditos()
        }).subscribe({
            next: (res: any) => {
                let gruposFiltrados = res.grupos || [];
                const userRole = (localStorage.getItem('userRole') || '').toLowerCase();
                const userStr = localStorage.getItem('user');
                let currentUserId = '';
                let currentUsername = '';
                if (userStr) {
                    try {
                        const userObj = JSON.parse(userStr);
                        currentUserId = String(userObj?.id || userObj?._id || '').trim();
                        currentUsername = String(userObj?.username || '').trim().toLowerCase();
                    } catch (e) {}
                }

                const matchAsesor = (item: any) => {
                    if (!item.asesor) return false;
                    if (typeof item.asesor === 'object') {
                        const aId = String(item.asesor._id || item.asesor.id || '').trim();
                        const aUser = String(item.asesor.username || '').trim().toLowerCase();
                        if (currentUserId && aId && aId === currentUserId) return true;
                        if (currentUsername && aUser && aUser === currentUsername) return true;
                        return false;
                    }
                    const aIdStr = String(item.asesor).trim();
                    if (currentUserId && aIdStr === currentUserId) return true;
                    if (currentUsername && aIdStr.toLowerCase() === currentUsername) return true;
                    return false;
                };

                if (userRole === 'master') {
                    gruposFiltrados = gruposFiltrados.filter(matchAsesor);
                }
                this.grupos = gruposFiltrados;
                this.notificationService.verificarNuevosGrupos(this.grupos);

                const resumenMap: { [grupoId: string]: { pagosTotal: number; saldoPendiente: number; tieneSolidarios: boolean; sinPagosAtrasados: boolean } } = {};
                this.grupos.forEach(g => {
                    const sinPagosAtrasados = !(this.verificarPagosAtrasados(g));
                    resumenMap[g._id] = { pagosTotal: 0, saldoPendiente: 0, tieneSolidarios: false, sinPagosAtrasados };
                });

                const miembros = res.miembrosAll || [];
                const creditos = res.creditosAll?.creditos || res.creditosAll || [];

                const creditosPorMiembro = new Map<string, any[]>();
                for (const c of creditos) {
                    const mId = c.miembro?._id || c.miembro;
                    if (mId) {
                        const key = String(mId);
                        if (!creditosPorMiembro.has(key)) creditosPorMiembro.set(key, []);
                        creditosPorMiembro.get(key)!.push(c);
                    }
                }

                for (const m of miembros) {
                    const grupoId = m.grupo?._id || m.grupo;
                    if (grupoId && resumenMap[grupoId]) {
                        const creditosMiembro = creditosPorMiembro.get(String(m._id)) || [];
                        const credito = creditosMiembro.find((c: any) => c.estado === 'Activo') || creditosMiembro[creditosMiembro.length - 1];

                        if (credito) {
                            const saldoPendiente = credito.saldoPendiente || 0;
                            const saldoTotal = credito.saldoTotal || 0;
                            const totalPagado = saldoTotal - saldoPendiente;

                            resumenMap[grupoId].saldoPendiente += saldoPendiente;
                            resumenMap[grupoId].pagosTotal += totalPagado;

                            // Check solidario
                            if (credito.pagos && credito.pagos.length > 0) {
                                const mIdStr = String(m._id);
                                let totalAdeudadoSolidario = 0;
                                let totalDevueltoSolidario = 0;

                                for (const p of credito.pagos) {
                                    if (p.pagoSolidario === true || p.pagoSolidario === 'true') {
                                        const prestadorId = (p.quienPrestoSolidario?._id || p.quienPrestoSolidario || '').toString();
                                        if (prestadorId !== '' && prestadorId !== mIdStr) {
                                            totalAdeudadoSolidario += (Number(p.montoSolidario || p.montoPagado) || 0);
                                        }
                                    }
                                    if (p.recuperacionSolidario === true) {
                                        totalDevueltoSolidario += (Number(p.montoSolidario || p.montoPagado) || 0);
                                    }
                                }

                                if ((totalAdeudadoSolidario - totalDevueltoSolidario) > 0) {
                                    resumenMap[grupoId].tieneSolidarios = true;
                                }
                            }
                        }
                    }
                }

                this.gruposResumen = resumenMap;
                this.cargando = false;
                this.cdr.markForCheck();
            },
            error: (err) => {
                console.error('Error al cargar grupos:', err);
                this.cargando = false;
                this.cdr.markForCheck();
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

    private verificarPagosAtrasados(grupo: any): boolean {
        const fechaPrimerPago = new Date(grupo.fechaPrimerPago);
        const hoy = new Date();
        hoy.setHours(0, 0, 0, 0);
        fechaPrimerPago.setHours(0, 0, 0, 0);
        return fechaPrimerPago <= hoy;
    }

    logout(): void {
        this.authService.logout();
        this.router.navigate(['/login']);
    }
}
