import { Component, OnInit, Inject, PLATFORM_ID, ChangeDetectorRef } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { Router } from '@angular/router';
import { GrupoService } from '../../../../core/services/grupo.service';

@Component({
    selector: 'app-asesor-lista-grupos',
    standalone: true,
    imports: [CommonModule],
    templateUrl: './asesor-lista-grupos.html',
    styleUrl: './asesor-lista-grupos.css',
})
export class AsesorListaGrupos implements OnInit {
    asesorName: string = '';
    grupos: any[] = [];
    gruposResumen: { [grupoId: string]: { pagosTotal: number; saldoPendiente: number; tieneSolidarios: boolean } } = {};
    cargando: boolean = true;

    constructor(
        @Inject(PLATFORM_ID) private platformId: Object,
        private grupoService: GrupoService,
        private router: Router,
        private cdr: ChangeDetectorRef
    ) { }

    ngOnInit(): void {
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
                this.grupos.forEach(g => {
                    this.gruposResumen[g._id] = { pagosTotal: 0, saldoPendiente: 0, tieneSolidarios: false };
                });

                this.grupoService.getMiembros().subscribe({
                    next: (miembros: any[]) => {
                        // Calcular resumenes usando los posibles pagos pactados (mock o del pagoPactado del array)
                        // Ya que el backend de abonos aun no existe, vamos a parsear la deuda y pagos solidarios basándonos en los datos disponibles.
                        miembros.forEach(m => {
                            const grupoId = m.grupo?._id || m.grupo;
                            if (grupoId && this.gruposResumen[grupoId]) {
                                // Simulando que 'pagoPactado' es lo que debe pagar y vamos a poner un placeholder de pagos
                                const cuota = m.pagoPactado || 500;
                                // Simular que algunos abonos existen, otros no. Idealmente aca consultariamos a getCreditos u otro endopint de abonos.
                                // Para modo de ejemplo / prueba:
                                this.gruposResumen[grupoId].saldoPendiente += cuota;

                                // Simulación de revisión de solidarios: si una bandera "esSolidario" existiera en el miembro o crédito...
                                // Vamos a poner false por defecto, a menos que m.solidarioActivo sea un property.
                            }
                        });
                        this.cargando = false;
                        this.cdr.detectChanges();
                    },
                    error: (err) => {
                        console.error('Error al obtener miembros:', err);
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
}
