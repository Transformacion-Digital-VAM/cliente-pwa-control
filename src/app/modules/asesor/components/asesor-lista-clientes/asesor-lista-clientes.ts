import { Component, OnInit, ChangeDetectorRef, Inject, PLATFORM_ID, Injector, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { forkJoin } from 'rxjs';
import { ClienteService } from '../../../../core/services/cliente.service';
import { GrupoService } from '../../../../core/services/grupo.service';
import { NotificationService } from '../../../../core/services/notification.service';
import { AuthService } from '../../../../core/services/auth.service';

@Component({
  selector: 'app-asesor-lista-clientes',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './asesor-lista-clientes.html',
  styleUrl: './asesor-lista-clientes.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AsesorListaClientes implements OnInit {
  clientes: any[] = [];
  clientesConCredito: any[] = [];
  cargando: boolean = true;
  error: string | null = null;
  asesorName: string = '';
  hoyStr: string = '';
  searchTerm: string = '';

  paginaActual: number = 1;
  itemsPorPagina: number = 6;

  get totalPaginas(): number {
    return Math.ceil(this.clientesFiltrados.length / this.itemsPorPagina) || 1;
  }

  get clientesPaginados(): any[] {
    const inicio = (this.paginaActual - 1) * this.itemsPorPagina;
    return this.clientesFiltrados.slice(inicio, inicio + this.itemsPorPagina);
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
          this.asesorName = userObj.nombre || userObj.username || 'Asesor';
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
    this.cdr.markForCheck();

    forkJoin({
      clientes: this.clienteService.getClientes(),
      creditosData: this.grupoService.getCreditos()
    }).subscribe({
      next: (res: any) => {
        let clientesBase = res.clientes || [];
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
          clientesBase = clientesBase.filter(matchAsesor);
        }
        const creditosAll = res.creditosData?.creditos || res.creditosData || [];

        // Indexar créditos por cliente en Map O(1)
        const creditosPorCliente = new Map<string, any[]>();
        for (const cred of creditosAll) {
          const clId = cred.cliente?._id || cred.cliente;
          if (clId) {
            const key = String(clId);
            if (!creditosPorCliente.has(key)) creditosPorCliente.set(key, []);
            creditosPorCliente.get(key)!.push(cred);
          }
        }

        const year = new Date().getFullYear();
        const month = String(new Date().getMonth() + 1).padStart(2, '0');
        const day = String(new Date().getDate()).padStart(2, '0');
        const hoyIsoPrefix = `${year}-${month}-${day}`;

        this.clientesConCredito = clientesBase.map((c: any) => {
          const creditosCliente = creditosPorCliente.get(String(c._id)) || [];
          const creditoCliente = creditosCliente.find((cred: any) => cred.estado === 'Activo') || creditosCliente[creditosCliente.length - 1];

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
            montoPactado: creditoCliente ? creditoCliente.pagoPactado : 0,
            estadoFiltro: estado === 'Liquidado' ? 'Liquidados' : (estado === 'Sin Crédito' ? 'Todos' : 'Activos'),
            tienePagoHoy: tienePagoHoy,
            diaVisitaStr: c.diaPago ? c.diaPago.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase() : ''
          };
        });

        this.cargando = false;
        this.cdr.markForCheck();
      },
      error: (err) => {
        console.error('Error al cargar clientes:', err);
        this.error = 'No se pudieron cargar los clientes.';
        this.cargando = false;
        this.cdr.markForCheck();
      }
    });
  }

  get clientesFiltrados(): any[] {
    if (!this.searchTerm || !this.searchTerm.trim()) {
      return this.clientesConCredito;
    }
    const term = this.searchTerm.toLowerCase().trim();
    return this.clientesConCredito.filter(c =>
      (c.nombre && c.nombre.toLowerCase().includes(term)) ||
      (c.apellidos && c.apellidos.toLowerCase().includes(term)) ||
      (c.diaPago && c.diaPago.toLowerCase().includes(term)) ||
      (c.clave && c.clave.toLowerCase().includes(term))
    );
  }

  verDetalleCliente(clienteId: string): void {
    this.router.navigate(['/hoja-control-individual', clienteId]);
  }

  volverAInicio(): void {
    this.router.navigate(['/home-asesor']);
  }
}
