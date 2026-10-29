import { Component, OnInit, OnDestroy, Inject, PLATFORM_ID, ChangeDetectorRef, Injector, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { GrupoService } from '../../../../core/services/grupo.service';
import { AuthService } from '../../../../core/services/auth.service';
import { NotificationService } from '../../../../core/services/notification.service';
import { forkJoin } from 'rxjs';
import { ClienteService } from '../../../../core/services/cliente.service';
import { environment } from '../../../../../environments/environment';
import Swal from 'sweetalert2';

@Component({
  selector: 'app-asesor-home',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './asesor-home.html',
  styleUrl: './asesor-home.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AsesorHome implements OnInit, OnDestroy {
  gruposHoy: any[] = [];
  gruposEnAtraso: any[] = [];
  hoyStr: string = '';
  searchTerm: string = '';

  vistaActual: 'grupos' | 'individuales' = 'grupos';
  asesorName: string = '';
  isCoordinador: boolean = false;

  expandedGroupId: string | null = null;
  clientesHoy: any[] = [];
  creditosAll: any[] = [];
  creditosPorMiembro: Map<string, any[]> = new Map();
  creditosPorCliente: Map<string, any[]> = new Map();

  // Modal Vista Previa (Solo Lectura)
  previewUrl: string | null = null;
  previewSafeUrl: SafeResourceUrl | null = null;
  previewGrupoNombre: string = '';

  get gruposHoyFiltrados(): any[] {
    if (!this.searchTerm || !this.searchTerm.trim()) return this.gruposHoy;
    const term = this.searchTerm.toLowerCase().trim();
    return this.gruposHoy.filter(g =>
      (g.nombre && g.nombre.toLowerCase().includes(term)) ||
      (g.clave && g.clave.toLowerCase().includes(term)) ||
      (g.diaVisita && g.diaVisita.toLowerCase().includes(term))
    );
  }

  get gruposEnAtrasoFiltrados(): any[] {
    if (!this.searchTerm || !this.searchTerm.trim()) return this.gruposEnAtraso;
    const term = this.searchTerm.toLowerCase().trim();
    return this.gruposEnAtraso.filter(g =>
      (g.nombre && g.nombre.toLowerCase().includes(term)) ||
      (g.clave && g.clave.toLowerCase().includes(term)) ||
      (g.diaAtraso && g.diaAtraso.toLowerCase().includes(term))
    );
  }

  get clientesHoyFiltrados(): any[] {
    if (!this.searchTerm || !this.searchTerm.trim()) return this.clientesHoy;
    const term = this.searchTerm.toLowerCase().trim();
    return this.clientesHoy.filter(c =>
      (c.nombre && c.nombre.toLowerCase().includes(term)) ||
      (c.apellidos && c.apellidos.toLowerCase().includes(term)) ||
      (c.diaPago && c.diaPago.toLowerCase().includes(term)) ||
      (c.clave && c.clave.toLowerCase().includes(term))
    );
  }

  // Paginación
  paginaGruposHoy: number = 1;
  itemsPorPaginaGrupos: number = 5;

  paginaAtrasos: number = 1;
  itemsPorPaginaAtrasos: number = 5;

  paginaClientesHoy: number = 1;
  itemsPorPaginaClientes: number = 5;

  get totalPaginasGruposHoy(): number {
    return Math.ceil(this.gruposHoyFiltrados.length / this.itemsPorPaginaGrupos) || 1;
  }

  get gruposHoyPaginados(): any[] {
    const inicio = (this.paginaGruposHoy - 1) * this.itemsPorPaginaGrupos;
    return this.gruposHoyFiltrados.slice(inicio, inicio + this.itemsPorPaginaGrupos);
  }

  get totalPaginasAtrasos(): number {
    return Math.ceil(this.gruposEnAtrasoFiltrados.length / this.itemsPorPaginaAtrasos) || 1;
  }

  get gruposEnAtrasoPaginados(): any[] {
    const inicio = (this.paginaAtrasos - 1) * this.itemsPorPaginaAtrasos;
    return this.gruposEnAtrasoFiltrados.slice(inicio, inicio + this.itemsPorPaginaAtrasos);
  }

  get totalPaginasClientesHoy(): number {
    return Math.ceil(this.clientesHoyFiltrados.length / this.itemsPorPaginaClientes) || 1;
  }

  get clientesHoyPaginados(): any[] {
    const inicio = (this.paginaClientesHoy - 1) * this.itemsPorPaginaClientes;
    return this.clientesHoyFiltrados.slice(inicio, inicio + this.itemsPorPaginaClientes);
  }

  onSearchChange(): void {
    this.paginaGruposHoy = 1;
    this.paginaAtrasos = 1;
    this.paginaClientesHoy = 1;
    this.cdr.markForCheck();
  }

  setPaginaGrupos(pag: number): void {
    if (pag >= 1 && pag <= this.totalPaginasGruposHoy) {
      this.paginaGruposHoy = pag;
      this.cdr.markForCheck();
    }
  }

  setPaginaAtrasos(pag: number): void {
    if (pag >= 1 && pag <= this.totalPaginasAtrasos) {
      this.paginaAtrasos = pag;
      this.cdr.markForCheck();
    }
  }

  setPaginaClientes(pag: number): void {
    if (pag >= 1 && pag <= this.totalPaginasClientesHoy) {
      this.paginaClientesHoy = pag;
      this.cdr.markForCheck();
    }
  }

  getArrayPaginas(total: number): number[] {
    return Array.from({ length: total }, (_, i) => i + 1);
  }

  constructor(
    @Inject(PLATFORM_ID) private platformId: Object,
    private grupoService: GrupoService,
    private authService: AuthService,
    private notificationService: NotificationService,
    private router: Router,
    private cdr: ChangeDetectorRef,
    private injector: Injector,
    private clienteService: ClienteService,
    private sanitizer: DomSanitizer
  ) { }

  ngOnInit(): void {
    if (isPlatformBrowser(this.platformId)) {
      const userStr = localStorage.getItem('user');
      const role = (localStorage.getItem('userRole') || '').toLowerCase();
      this.isCoordinador = role === 'coordinador';

      if (userStr) {
        try {
          const userObj = JSON.parse(userStr);
          this.asesorName = userObj.nombre || userObj.username || 'Asesor';
        } catch (e) {
          this.asesorName = 'Asesor';
        }
      }
      this.obtenerGruposDeHoy();

      // Solicitar ubicación automáticamente de forma silenciosa/transparente (SOLO UNA VEZ POR SESIÓN)
      setTimeout(() => {
        if (!sessionStorage.getItem('ubicacion_compartida_hoy')) {
          this.compartirMiUbicacion();
          sessionStorage.setItem('ubicacion_compartida_hoy', 'true');
        }
      }, 1500);
    }
  }

  irAModuloCoordinador(): void {
    this.router.navigate(['/coordinador-hojas-control']);
  }

  verDetalleGrupo(grupoId: string): void {
    this.router.navigate(['/hoja-control-asesor', grupoId]);
  }

  verDetalleCliente(clienteId: string): void {
    this.router.navigate(['/hoja-control-individual', clienteId]);
  }

  verTodosLosGrupos(): void {
    this.router.navigate(['/grupos-asesor']);
  }

  verTodosMisClientes(): void {
    this.router.navigate(['/clientes-asesor']);
  }

  compartirMiUbicacion(): void {
    import('../../../../core/services/location.service').then(m => {
      const locationService = this.injector.get(m.LocationService);
      locationService.sendCurrentLocation().catch(() => {
        console.log("No se pudo compartir la ubicación.");
      });
    });
  }

  setVista(nuevaVista: 'grupos' | 'individuales'): void {
    this.vistaActual = nuevaVista;
    this.cdr.markForCheck();
  }

  logout(): void {
    this.authService.logout();
    this.router.navigate(['/login']);
  }

  irAInicio(): void {
    this.router.navigate(['/home-asesor']);
  }

  obtenerGruposDeHoy(): void {
    const dias = ['Domingo', 'Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes', 'Sabado'];
    const hoy = new Date();
    this.hoyStr = dias[hoy.getDay()];

    const year = hoy.getFullYear();
    const month = String(hoy.getMonth() + 1).padStart(2, '0');
    const day = String(hoy.getDate()).padStart(2, '0');
    const hoyIsoPrefix = `${year}-${month}-${day}`;

    forkJoin({
      gruposAll: this.grupoService.getGrupos(),
      creditosAll: this.grupoService.getCreditos(),
      clientesAll: this.clienteService.getClientes()
    }).subscribe({
      next: (res: any) => {
        const grupos = res.gruposAll || [];
        const creditosAll = res.creditosAll?.creditos || res.creditosAll || [];
        const clientes = res.clientesAll || [];

        this.notificationService.verificarNuevosGrupos(grupos);

        // Indexar créditos por miembro y por cliente en Map O(1)
        const creditosPorMiembro = new Map<string, any[]>();
        const creditosPorCliente = new Map<string, any[]>();

        for (const c of creditosAll) {
          const mId = c.miembro?._id || c.miembro;
          if (mId) {
            const key = String(mId);
            if (!creditosPorMiembro.has(key)) creditosPorMiembro.set(key, []);
            creditosPorMiembro.get(key)!.push(c);
          }
          const clId = c.cliente?._id || c.cliente;
          if (clId) {
            const key = String(clId);
            if (!creditosPorCliente.has(key)) creditosPorCliente.set(key, []);
            creditosPorCliente.get(key)!.push(c);
          }
        }

        this.creditosAll = creditosAll;
        this.creditosPorMiembro = creditosPorMiembro;
        this.creditosPorCliente = creditosPorCliente;

        const normalize = (s: string) =>
          s ? s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim() : '';

        const toLocalPrefix = (d: Date): string => {
          const yy = d.getFullYear();
          const mm = String(d.getMonth() + 1).padStart(2, '0');
          const dd = String(d.getDate()).padStart(2, '0');
          return `${yy}-${mm}-${dd}`;
        };

        const calcPagosGrupo = (g: any, fechaPrefix: string) => {
          const integrantes = g.integrantes ? g.integrantes.map((i: any) => String(i._id || i)) : [];
          let totalEsperado = 0;
          let totalPagado = 0;
          for (const mId of integrantes) {
            const creditosM = creditosPorMiembro.get(mId) || [];
            for (const c of creditosM) {
              if (c.estado === 'Activo') {
                totalEsperado += (Number(c.pagoPactado) || 0);
                for (const p of (c.pagos || [])) {
                  if (p.fechaPago && p.fechaPago.startsWith(fechaPrefix) && !p.recuperacionSolidario) {
                    totalPagado += (Number(p.montoPagado) || Number(p.montoSolidario) || 0);
                  }
                }
              }
            }
          }
          return { totalEsperado, totalPagado };
        };

        const calcPagosHistoricosGrupo = (g: any) => {
          const integrantes = g.integrantes ? g.integrantes.map((i: any) => String(i._id || i)) : [];
          let totalPagado = 0;
          for (const mId of integrantes) {
            const creditosM = creditosPorMiembro.get(mId) || [];
            for (const c of creditosM) {
              if (c.estado === 'Activo') {
                for (const p of (c.pagos || [])) {
                  if (!p.recuperacionSolidario) {
                    totalPagado += (Number(p.montoPagado) || Number(p.montoSolidario) || 0);
                  }
                }
              }
            }
          }
          return totalPagado;
        };

        const userStr = localStorage.getItem('user');
        const userRole = (localStorage.getItem('userRole') || '').toLowerCase();
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

        let gruposFiltrados = grupos;
        if (userRole === 'master' || userRole === 'coordinador') {
          gruposFiltrados = grupos.filter(matchAsesor);
        }

        const diaHoyNorm = normalize(this.hoyStr);

        const esDiaCobro = (diaVisitaOPago: string): boolean => {
          if (!diaVisitaOPago) return false;
          const normalizado = normalize(diaVisitaOPago);
          const match = normalizado.match(/(?:dia\s+)?(\d{1,2})(?:\s+de\s+cada\s+mes)?/i);

          if (match) {
            const diaPactado = parseInt(match[1], 10);
            const date = hoy.getDate();
            const day = hoy.getDay();

            if (date === diaPactado && day !== 0) {
              return true;
            }

            if (day === 6) {
              const manana = new Date(hoy);
              manana.setDate(hoy.getDate() + 1);

              if (manana.getDay() === 0 && manana.getDate() === diaPactado) {
                return true;
              }
            }

            return false;
          }
          return normalizado === diaHoyNorm;
        };

        const gruposDelDia = gruposFiltrados.filter((g: any) => esDiaCobro(g.diaVisita));

        this.gruposHoy = gruposDelDia.filter((g: any) => {
          const { totalEsperado, totalPagado } = calcPagosGrupo(g, hoyIsoPrefix);

          g.totalEsperado = totalEsperado;
          g.totalPagadoHoy = totalPagado;
          g.pagoIncompleto = totalPagado > 0 && totalPagado < totalEsperado;
          g.montoFaltante = Math.max(0, totalEsperado - totalPagado);
          g.enAtraso = false;

          let nuncaHaPagadoAtrasado = false;
          if (g.fechaPrimerPago) {
            const fechaPrimerPagoObj = new Date(g.fechaPrimerPago);
            fechaPrimerPagoObj.setHours(0, 0, 0, 0);
            const hoyObj = new Date(hoy);
            hoyObj.setHours(0, 0, 0, 0);
            if (hoyObj >= fechaPrimerPagoObj) {
              const historico = calcPagosHistoricosGrupo(g);
              if (historico === 0) {
                nuncaHaPagadoAtrasado = true;
              }
            }
          }
          g.nuncaHaPagadoAtrasado = nuncaHaPagadoAtrasado;

          if (totalEsperado === 0) return totalPagado === 0;
          return totalPagado < totalEsperado;
        });

        const idsGruposHoy = new Set(this.gruposHoy.map((g: any) => g._id));
        this.gruposEnAtraso = [];

        const calcPagosEnFecha = (g: any, fechaPrefix: string) => {
          const integrantes = g.integrantes ? g.integrantes.map((i: any) => String(i._id || i)) : [];
          let totalEsperado = 0;
          let totalPagado = 0;
          for (const mId of integrantes) {
            const creditosM = creditosPorMiembro.get(mId) || [];
            for (const c of creditosM) {
              totalEsperado += (Number(c.pagoPactado) || 0);
              for (const p of (c.pagos || [])) {
                if (p.fechaPago && p.fechaPago.startsWith(fechaPrefix) && !p.recuperacionSolidario) {
                  totalPagado += (Number(p.montoPagado) || Number(p.montoSolidario) || 0);
                }
              }
            }
          }
          return { totalEsperado, totalPagado };
        };

        const calcPagosDesde = (g: any, fechaDesde: string) => {
          const integrantes = g.integrantes ? g.integrantes.map((i: any) => String(i._id || i)) : [];
          let totalEsperado = 0;
          let totalPagado = 0;
          for (const mId of integrantes) {
            const creditosM = creditosPorMiembro.get(mId) || [];
            for (const c of creditosM) {
              if (c.estado === 'Activo') {
                totalEsperado += (Number(c.pagoPactado) || 0);
                for (const p of (c.pagos || [])) {
                  if (p.fechaPago && p.fechaPago >= fechaDesde && !p.recuperacionSolidario) {
                    totalPagado += (Number(p.montoPagado) || Number(p.montoSolidario) || 0);
                  }
                }
              }
            }
          }
          return { totalEsperado, totalPagado };
        };

        for (let delta = 1; delta <= 6; delta++) {
          const fecha = new Date(hoy);
          fecha.setDate(hoy.getDate() - delta);

          if (fecha.getDay() === 0) break;

          const diaNom = dias[fecha.getDay()];
          const diaNomNorm = normalize(diaNom);
          const fechaPrefix = toLocalPrefix(fecha);

          const gruposDiaPasado = gruposFiltrados.filter(
            (g: any) => normalize(g.diaVisita || '') === diaNomNorm
          );

          for (const g of gruposDiaPasado) {
            if (idsGruposHoy.has(g._id)) continue;
            if (this.gruposEnAtraso.some((x: any) => x._id === g._id)) continue;

            const { totalEsperado: espDia, totalPagado: pagDia } = calcPagosEnFecha(g, fechaPrefix);
            const noPagoEnSuDia = espDia === 0 ? pagDia === 0 : pagDia < espDia;
            if (!noPagoEnSuDia) continue;

            const { totalEsperado, totalPagado } = calcPagosDesde(g, fechaPrefix);
            const sigueAbierto = totalEsperado === 0 ? totalPagado === 0 : totalPagado < totalEsperado;
            if (!sigueAbierto) continue;

            g.totalEsperado = totalEsperado;
            g.totalPagadoHoy = totalPagado;
            g.pagoIncompleto = totalPagado > 0 && totalPagado < totalEsperado;
            g.montoFaltante = Math.max(0, totalEsperado - totalPagado);
            g.enAtraso = true;
            g.diaAtraso = diaNom;

            this.gruposEnAtraso.push(g);
          }
        }

        this.notificationService.programarRecordatoriosVisita(this.gruposHoy);

        // Procesar Clientes
        let clientesFiltrados = clientes || [];
        if (userRole === 'master' || userRole === 'coordinador') {
          clientesFiltrados = clientesFiltrados.filter(matchAsesor);
        }

        const clientesDelDia = clientesFiltrados.filter((c: any) => esDiaCobro(c.diaPago));

        this.clientesHoy = clientesDelDia.filter((c: any) => {
          let totalPagadoHoy = 0;
          let totalEsperadoHoy = 0;
          let estaLiquidado = false;
          let totalPagadoHistorico = 0;

          const creditosCliente = creditosPorCliente.get(String(c._id)) || [];
          const creditoCliente = creditosCliente.find((cred: any) => cred.estado === 'Activo') || creditosCliente[creditosCliente.length - 1];

          if (creditoCliente) {
            totalEsperadoHoy = Number(creditoCliente.pagoPactado) || 0;
            const pagosHoy = (creditoCliente.pagos || []).filter((p: any) =>
              p.fechaPago && p.fechaPago.startsWith(hoyIsoPrefix)
            );
            for (const p of pagosHoy) {
              totalPagadoHoy += (Number(p.montoPagado) || Number(p.montoSolidario) || 0);
            }

            for (const p of (creditoCliente.pagos || [])) {
              totalPagadoHistorico += (Number(p.montoPagado) || Number(p.montoSolidario) || 0);
            }

            if (creditoCliente.estado === 'Liquidado') {
              estaLiquidado = true;
            }
          }

          c.totalEsperado = totalEsperadoHoy;
          c.totalPagadoHoy = totalPagadoHoy;
          c.pagoIncompleto = totalPagadoHoy > 0 && totalPagadoHoy < totalEsperadoHoy;
          c.montoFaltante = Math.max(0, totalEsperadoHoy - totalPagadoHoy);

          let nuncaHaPagadoAtrasado = false;
          if (c.fechaPrimerPago) {
            const fechaPrimerPagoObj = new Date(c.fechaPrimerPago);
            fechaPrimerPagoObj.setHours(0, 0, 0, 0);
            const hoyObj = new Date(hoy);
            hoyObj.setHours(0, 0, 0, 0);
            if (hoyObj >= fechaPrimerPagoObj && totalPagadoHistorico === 0) {
              nuncaHaPagadoAtrasado = true;
            }
          }
          c.nuncaHaPagadoAtrasado = nuncaHaPagadoAtrasado;

          if (estaLiquidado) return false;
          if (totalEsperadoHoy === 0) return totalPagadoHoy === 0;
          return totalPagadoHoy < totalEsperadoHoy;
        });

        this.notificationService.programarNotificacionDiaria(this.gruposHoy.length, this.clientesHoy.length);
        this.cdr.markForCheck();
      },
      error: (err) => {
        console.error('Error al obtener datos combinados para el home:', err);
        this.cdr.markForCheck();
      }
    });
  }

  ngOnDestroy(): void {
    this.notificationService.limpiarTimerDiario();
  }

  // --- VISTA PREVIA (SOLO LECTURA) ---

  getCicloActualGrupo(grupo: any): number {
    if (!grupo) return 1;
    let maxCiclo = Number(grupo.cicloActual) || 0;
    const integrantes = grupo.integrantes || [];
    for (const m of integrantes) {
      const mId = String(m._id || m);
      const creds = this.creditosPorMiembro.get(mId) || [];
      for (const cred of creds) {
        const cCiclo = Number(cred.ciclo) || 0;
        if (cred.estado === 'Activo' && cCiclo > 0) return cCiclo;
        if (cCiclo > maxCiclo) maxCiclo = cCiclo;
      }
    }
    return maxCiclo > 0 ? maxCiclo : 1;
  }

  getSemanasGrupo(grupo: any, ciclo?: number): number {
    if (!grupo) return 16;
    const cicloABuscar = ciclo || this.getCicloActualGrupo(grupo);
    const integrantes = grupo.integrantes || [];
    const semanasEncontradas: number[] = [];

    for (const m of integrantes) {
      const mId = String(m._id || m);
      const creds = this.creditosPorMiembro.get(mId) || [];
      for (const cred of creds) {
        const cCiclo = Number(cred.ciclo) || 0;
        if (cCiclo === cicloABuscar || cred.estado === 'Activo') {
          const sem = Number(cred.semanas) || (cred.tipoCredito === '8S' ? 8 : 0);
          if (sem > 0) semanasEncontradas.push(sem);
        }
      }
    }

    if (semanasEncontradas.length > 0) {
      return Math.max(...semanasEncontradas);
    }
    return Number(grupo.plazoSemanas) || 16;
  }

  getCicloActualCliente(cliente: any): number {
    if (!cliente) return 1;
    let maxCiclo = Number(cliente.cicloActual) || 0;
    const clId = String(cliente._id || cliente.id);
    const creds = this.creditosPorCliente.get(clId) || [];
    for (const cred of creds) {
      const cCiclo = Number(cred.ciclo) || 0;
      if (cred.estado === 'Activo' && cCiclo > 0) return cCiclo;
      if (cCiclo > maxCiclo) maxCiclo = cCiclo;
    }
    return maxCiclo > 0 ? maxCiclo : 1;
  }

  getSemanasCliente(cliente: any, ciclo?: number): number {
    if (!cliente) return 16;
    const cicloABuscar = ciclo || this.getCicloActualCliente(cliente);
    const clId = String(cliente._id || cliente.id);
    const creds = this.creditosPorCliente.get(clId) || [];
    for (const cred of creds) {
      const cCiclo = Number(cred.ciclo) || 0;
      if (cCiclo === cicloABuscar || cred.estado === 'Activo') {
        const sem = Number(cred.semanas) || 16;
        if (sem > 0) return sem;
      }
    }
    return Number(cliente.plazoSemanas) || 16;
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
            <select id="swal-tipo-hoja-home" style="width: 100%; padding: 8px 12px; border: 1px solid #cbd5e1; border-radius: 8px; font-size: 14px; background-color: #fff;">
              <option value="llena">Hoja Llena (con datos de crédito)</option>
              <option value="vacia">Hoja Vacía (en blanco)</option>
            </select>
          </div>
          <div>
            <label style="display: block; font-size: 11px; font-weight: 700; color: #475569; text-transform: uppercase; margin-bottom: 4px;">Rango de Semanas (${totalSemanas} semanas)</label>
            <select id="swal-rango-semanas-home" style="width: 100%; padding: 8px 12px; border: 1px solid #cbd5e1; border-radius: 8px; font-size: 14px; background-color: #fff;">
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
        const tipoElem = document.getElementById('swal-tipo-hoja-home') as HTMLSelectElement;
        const rangoElem = document.getElementById('swal-rango-semanas-home') as HTMLSelectElement;
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

  async vistaPreviaIndividual(cliente: any, event?: Event): Promise<void> {
    if (event) event.stopPropagation();

    const ciclo = this.getCicloActualCliente(cliente);
    const totalSemanas = this.getSemanasCliente(cliente, ciclo);
    const opciones = this.generarOpcionesSemanas(totalSemanas);
    const optionsHtml = Object.entries(opciones)
      .map(([val, label]) => `<option value="${val}">${label}</option>`)
      .join('');

    const { value: formValues, isConfirmed } = await Swal.fire({
      title: 'Vista Previa Individual (Solo Lectura)',
      html: `
        <div style="text-align: left; padding-top: 8px;">
          <p style="font-size: 13px; color: #64748b; margin-bottom: 14px;">
            Cliente: <strong style="color: #1e293b;">${cliente.nombre || 'Sin Nombre'} ${cliente.apellidos || ''}</strong>
          </p>
          <div style="margin-bottom: 16px;">
            <label style="display: block; font-size: 11px; font-weight: 700; color: #475569; text-transform: uppercase; margin-bottom: 4px;">Tipo de Hoja</label>
            <select id="swal-tipo-hoja-ind-home" style="width: 100%; padding: 8px 12px; border: 1px solid #cbd5e1; border-radius: 8px; font-size: 14px; background-color: #fff;">
              <option value="llena">Hoja Llena (con datos)</option>
              <option value="vacia">Hoja Vacía (en blanco)</option>
            </select>
          </div>
          <div>
            <label style="display: block; font-size: 11px; font-weight: 700; color: #475569; text-transform: uppercase; margin-bottom: 4px;">Rango de Semanas (${totalSemanas} semanas)</label>
            <select id="swal-rango-semanas-ind-home" style="width: 100%; padding: 8px 12px; border: 1px solid #cbd5e1; border-radius: 8px; font-size: 14px; background-color: #fff;">
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
        const tipoElem = document.getElementById('swal-tipo-hoja-ind-home') as HTMLSelectElement;
        const rangoElem = document.getElementById('swal-rango-semanas-ind-home') as HTMLSelectElement;
        return {
          tipo: tipoElem ? tipoElem.value : 'llena',
          rango: rangoElem ? rangoElem.value : 'completa'
        };
      }
    });

    if (isConfirmed && formValues) {
      const estadoGrupo = cliente.estadoGrupo ? `&estadoGrupo=${cliente.estadoGrupo}` : '';
      let url = `${environment.apiUrl}/creditos/hoja-control-individual/${cliente._id}/${ciclo}?preview=true${estadoGrupo}`;
      if (formValues.tipo === 'llena') {
        url += '&llena=true';
      }
      if (formValues.rango !== 'completa') {
        const { inicio, fin } = this.obtenerRangoSemanas(formValues.rango, totalSemanas);
        url += `&semanaInicio=${inicio}&semanaFin=${fin}`;
      }
      this.abrirModalPreview(url, `${cliente.nombre || 'Cliente'} (Ciclo ${ciclo})`);
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
}