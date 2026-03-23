import { Component, OnInit, ChangeDetectorRef, Inject, PLATFORM_ID, Injector } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { Router } from '@angular/router';
import { forkJoin } from 'rxjs';
import { ClienteService } from '../../../../core/services/cliente.service';
import { GrupoService } from '../../../../core/services/grupo.service';
import { NotificationService } from '../../../../core/services/notification.service';
import { AuthService } from '../../../../core/services/auth.service';

@Component({
  selector: 'app-asesor-lista-clientes',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './asesor-lista-clientes.html',
  styleUrl: './asesor-lista-clientes.css'
})
export class AsesorListaClientes implements OnInit {
  clientes: any[] = [];
  clientesConCredito: any[] = []; // Nueva lista enriquecida
  cargando: boolean = true;
  error: string | null = null;
  asesorName: string = '';
  hoyStr: string = '';

  constructor(
    @Inject(PLATFORM_ID) private platformId: Object,
    private grupoService: GrupoService,
    private notificationService: NotificationService,
    private router: Router,
    private cdr: ChangeDetectorRef,
    private injector: Injector,
    private clienteService: ClienteService,
    private authService: AuthService
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
      this.cargarClientes();
    }
  }

  volver(): void {
    this.router.navigate(['/home-asesor']);
  }

  irAInicio(): void {
    this.router.navigate(['/home-asesor']);
  }

  irAGrupos(): void {
    this.router.navigate(['/grupos-asesor']);
  }

  logout(): void {
    this.authService.logout();
    this.router.navigate(['/login']);
  }

  cargarClientes(): void {
    this.cargando = true;

    forkJoin({
      clientes: this.clienteService.getClientes(),
      creditosData: this.grupoService.getCreditos()
    }).subscribe({
      next: (res: any) => {
        const clientesBase = res.clientes || [];
        const creditosAll = res.creditosData.creditos || res.creditosData || [];

        // Día de HOY para el filtro de pagos
        const dias = ['Domingo', 'Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes', 'Sabado'];
        const hoy = new Date();
        const hoyStr = dias[hoy.getDay()].normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

        const year = hoy.getFullYear();
        const month = String(hoy.getMonth() + 1).padStart(2, '0');
        const day = String(hoy.getDate()).padStart(2, '0');
        const hoyIsoPrefix = `${year}-${month}-${day}`;

        // Enriquecer y filtrar
        this.clientesConCredito = clientesBase.map((c: any) => {
          // Buscar crédito individual
          const creditoCliente = creditosAll.find((cred: any) =>
            (cred.tipoCredito === 'Individual' || cred.cliente) &&
            (cred.cliente?._id === c._id || cred.cliente === c._id)
          );

          let estado = 'Sin Crédito';
          let tienePagoHoy = false;

          if (creditoCliente) {
            estado = creditoCliente.estado || 'Activo';
            if (creditoCliente.pagos && creditoCliente.pagos.some((p: any) => p.fechaPago && p.fechaPago.startsWith(hoyIsoPrefix))) {
              tienePagoHoy = true;
            }
          }

          return {
            ...c,
            creditoActivo: creditoCliente,
            estadoFiltro: estado === 'Liquidado' ? 'Liquidados' : (estado === 'Sin Crédito' ? 'Todos' : 'Activos'),
            tienePagoHoy: tienePagoHoy,
            diaVisitaStr: c.diaPago ? c.diaPago.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase() : ''
          };
        });

        // Opcional: si quisieras ocultarlos de la lista 'Activos' podrías hacerlo aquí, 
        // pero el usuario solicita que SIEMPRE se vean en "Ver todos mis clientes".
        // Por lo tanto, conservaremos todos los clientes independientemente de si ya pagaron hoy.

        this.cargando = false;
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error('Error al cargar clientes:', err);
        this.error = 'No se pudieron cargar los clientes.';
        this.cargando = false;
        this.cdr.detectChanges();
      }
    });
  }

  get clientesFiltrados(): any[] {
    return this.clientesConCredito;
  }

  verDetalleCliente(clienteId: string): void {
    this.router.navigate(['/hoja-control-individual', clienteId]);
  }

  volverAInicio(): void {
    this.router.navigate(['/home-asesor']);
  }
}
