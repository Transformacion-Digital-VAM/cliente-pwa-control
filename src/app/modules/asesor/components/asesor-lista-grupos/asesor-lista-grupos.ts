import { Component, OnInit, Inject, PLATFORM_ID, ChangeDetectorRef, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { GrupoService } from '../../../../core/services/grupo.service';
import { NotificationService } from '../../../../core/services/notification.service';
import { forkJoin } from 'rxjs';
import { AuthService } from '../../../../core/services/auth.service';
import { environment } from '../../../../../environments/environment';
import Swal from 'sweetalert2';

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
    miembrosAll: any[] = [];
    creditosAll: any[] = [];

    // Modal de Vista Previa (Solo Lectura)
    previewUrl: string | null = null;
    previewSafeUrl: SafeResourceUrl | null = null;
    previewGrupoNombre: string = '';

    constructor(
        @Inject(PLATFORM_ID) private platformId: Object,
        private grupoService: GrupoService,
        private authService: AuthService,
        private notificationService: NotificationService,
        private router: Router,
        private cdr: ChangeDetectorRef,
        private sanitizer: DomSanitizer
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
                    } catch (e) { }
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

                if (userRole === 'master' || userRole === 'coordinador') {
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
                this.miembrosAll = miembros;
                this.creditosAll = creditos;

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

    // --- VISTA PREVIA (SOLO LECTURA) ---

    getCicloActualGrupo(grupo: any): number {
        if (!grupo) return 1;
        let maxCiclo = Number(grupo.cicloActual) || 0;
        const gId = String(grupo._id);
        const miembrosGrupo = this.miembrosAll.filter((m: any) => {
            const mgId = m.grupo?._id || m.grupo;
            return mgId && String(mgId) === gId;
        });
        const mIds = new Set(miembrosGrupo.map((m: any) => String(m._id)));

        for (const c of this.creditosAll) {
            const mId = c.miembro?._id || c.miembro;
            if (mId && mIds.has(String(mId))) {
                const cCiclo = Number(c.ciclo) || 0;
                if (c.estado === 'Activo' && cCiclo > 0) return cCiclo;
                if (cCiclo > maxCiclo) maxCiclo = cCiclo;
            }
        }
        return maxCiclo > 0 ? maxCiclo : 1;
    }

    getSemanasGrupo(grupo: any, ciclo?: number): number {
        if (!grupo) return 16;
        const cicloABuscar = ciclo || this.getCicloActualGrupo(grupo);
        const gId = String(grupo._id);
        const miembrosGrupo = this.miembrosAll.filter((m: any) => {
            const mgId = m.grupo?._id || m.grupo;
            return mgId && String(mgId) === gId;
        });
        const mIds = new Set(miembrosGrupo.map((m: any) => String(m._id)));
        const semanasEncontradas: number[] = [];

        for (const c of this.creditosAll) {
            const mId = c.miembro?._id || c.miembro;
            if (mId && mIds.has(String(mId))) {
                const cCiclo = Number(c.ciclo) || 0;
                if (cCiclo === cicloABuscar || c.estado === 'Activo') {
                    const sem = Number(c.semanas) || (c.tipoCredito === '8S' ? 8 : 0);
                    if (sem > 0) semanasEncontradas.push(sem);
                }
            }
        }

        if (semanasEncontradas.length > 0) {
            return Math.max(...semanasEncontradas);
        }
        return Number(grupo.plazoSemanas) || 16;
    }

    generarOpcionesSemanas(totalSemanas: number): { [key: string]: string } {
        const opciones: { [key: string]: string } = {};
        opciones['completa'] = `Hoja Completa (1 - ${totalSemanas})`;

        if (totalSemanas > 8) {
            const mitad = Math.ceil(totalSemanas / 2);
            opciones['1-8'] = `Parte 1: Semanas 1 a ${mitad}`;
            opciones['9-16'] = `Parte 2: Semanas ${mitad + 1} a ${totalSemanas}`;
        }
        return opciones;
    }

    obtenerRangoSemanas(opcion: string, totalSemanas: number): { inicio: number, fin: number } {
        if (opcion === 'completa') {
            return { inicio: 1, fin: totalSemanas };
        }
        const mitad = Math.ceil(totalSemanas / 2);
        if (opcion === '1-8') {
            return { inicio: 1, fin: mitad };
        }
        if (opcion === '9-16') {
            return { inicio: mitad + 1, fin: totalSemanas };
        }
        return { inicio: 1, fin: totalSemanas };
    }

    async vistaPreviaGrupo(grupo: any, event?: Event): Promise<void> {
        if (event) event.stopPropagation();

        const ciclo = this.getCicloActualGrupo(grupo);
        const totalSemanas = this.getSemanasGrupo(grupo, ciclo);
        const opciones = this.generarOpcionesSemanas(totalSemanas);
        const optionsHtml = Object.entries(opciones)
            .map(([val, label]) => `<option value="${val}">${label}</option>`)
            .join('');

        const { value: formValues, isConfirmed } = await Swal.fire({
            title: 'Vista Previa (Solo Lectura)',
            html: `
                <div style="text-align: left; padding-top: 8px;">
                    <p style="font-size: 13px; color: #64748b; margin-bottom: 14px;">
                        Grupo: <strong style="color: #1e293b;">${grupo.nombre || 'Sin Nombre'}</strong> (${grupo.clave || 'S/C'})
                    </p>
                    <div style="margin-bottom: 16px;">
                        <label style="display: block; font-size: 11px; font-weight: 700; color: #475569; text-transform: uppercase; margin-bottom: 4px;">Tipo de Hoja</label>
                        <select id="swal-tipo-hoja" style="width: 100%; padding: 8px 12px; border: 1px solid #cbd5e1; border-radius: 8px; font-size: 14px; background-color: #fff;">
                            <option value="llena">Hoja Llena (con datos de crédito)</option>
                            <option value="vacia">Hoja Vacía (en blanco)</option>
                        </select>
                    </div>
                    <div>
                        <label style="display: block; font-size: 11px; font-weight: 700; color: #475569; text-transform: uppercase; margin-bottom: 4px;">Rango de Semanas (${totalSemanas} semanas)</label>
                        <select id="swal-rango-semanas" style="width: 100%; padding: 8px 12px; border: 1px solid #cbd5e1; border-radius: 8px; font-size: 14px; background-color: #fff;">
                            ${optionsHtml}
                        </select>
                    </div>
                    <div style="margin-top: 14px; padding: 8px 12px; background-color: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px;">
                        <p style="font-size: 11px; color: #1e40af; margin: 0; font-weight: 600;">
                            Esta vista es únicamente para visualizar información en campo, sin descargas.
                        </p>
                    </div>
                </div>
            `,
            focusConfirm: false,
            showCancelButton: true,
            confirmButtonText: 'Abrir Vista Previa',
            cancelButtonText: 'Cancelar',
            confirmButtonColor: '#2563eb',
            preConfirm: () => {
                const tipoElem = document.getElementById('swal-tipo-hoja') as HTMLSelectElement;
                const rangoElem = document.getElementById('swal-rango-semanas') as HTMLSelectElement;
                return {
                    tipo: tipoElem ? tipoElem.value : 'llena',
                    rango: rangoElem ? rangoElem.value : 'completa'
                };
            }
        });

        if (isConfirmed && formValues) {
            let url = `${environment.apiUrl}/creditos/hoja-control/${grupo._id}/${ciclo}?preview=true`;
            if (formValues.tipo === 'llena') {
                url += '&llena=true';
            }
            if (formValues.rango !== 'completa') {
                const { inicio, fin } = this.obtenerRangoSemanas(formValues.rango, totalSemanas);
                url += `&semanaInicio=${inicio}&semanaFin=${fin}`;
            }
            this.abrirModalPreview(url, `${grupo.nombre || 'Grupo'} (Ciclo ${ciclo})`);
        }
    }

    abrirModalPreview(url: string, nombre: string): void {
        this.previewGrupoNombre = nombre;
        this.previewUrl = url;
        this.previewSafeUrl = this.sanitizer.bypassSecurityTrustResourceUrl(`${url}#toolbar=0`);
        this.cdr.markForCheck();
    }

    cerrarPreview(): void {
        this.previewUrl = null;
        this.previewSafeUrl = null;
        this.previewGrupoNombre = '';
        this.cdr.markForCheck();
    }

    abrirEnNuevaPestana(): void {
        if (this.previewUrl) {
            window.open(`${this.previewUrl}#toolbar=0`, '_blank');
        }
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
