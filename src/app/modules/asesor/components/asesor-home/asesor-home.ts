import { Component, OnInit, OnDestroy, Inject, PLATFORM_ID, ChangeDetectorRef, Injector } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { Router } from '@angular/router';
import { GrupoService } from '../../../../core/services/grupo.service';
import { AuthService } from '../../../../core/services/auth.service';
import { NotificationService } from '../../../../core/services/notification.service';
import { forkJoin } from 'rxjs';
import { ClienteService } from '../../../../core/services/cliente.service';

@Component({
  selector: 'app-asesor-home',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './asesor-home.html',
  styleUrl: './asesor-home.css',
})
export class AsesorHome implements OnInit, OnDestroy {
  gruposHoy: any[] = [];
  gruposEnAtraso: any[] = [];
  hoyStr: string = '';

  // 1. AGREGAMOS LA PROPIEDAD QUE FALTA
  vistaActual: 'grupos' | 'individuales' = 'grupos';
  asesorName: string = '';

  expandedGroupId: string | null = null;
  pagosRegistrados: { [groupId: string]: { monto: number, solidario: boolean, fecha: Date } } = {};

  // Propiedad para los clientes individuales de hoy
  clientesHoy: any[] = [];

  constructor(
    @Inject(PLATFORM_ID) private platformId: Object,
    private grupoService: GrupoService,
    private authService: AuthService,
    private notificationService: NotificationService,
    private router: Router,
    private cdr: ChangeDetectorRef,
    private injector: Injector,
    private clienteService: ClienteService
  ) { }

  ngOnInit(): void {
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
        // Los errores ya los muestra LocationService vía SweetAlert
        console.log("No se pudo compartir la ubicación.");
      });
    });
  }

  // 2. AGREGAMOS EL MÉTODO PARA CAMBIAR DE PANTALLA
  setVista(nuevaVista: 'grupos' | 'individuales'): void {
    this.vistaActual = nuevaVista;
    // Forzamos la detección de cambios para que la UI responda rápido
    this.cdr.detectChanges();
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
      creditosAll: this.grupoService.getCreditos()
    }).subscribe({
      next: (res: any) => {
        const grupos = res.gruposAll || [];
        const creditosAll = res.creditosAll.creditos || res.creditosAll || [];

        this.notificationService.verificarNuevosGrupos(grupos);

        const normalize = (s: string) =>
          s ? s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim() : '';

        const toLocalPrefix = (d: Date): string => {
          const yy = d.getFullYear();
          const mm = String(d.getMonth() + 1).padStart(2, '0');
          const dd = String(d.getDate()).padStart(2, '0');
          return `${yy}-${mm}-${dd}`;
        };

        const calcPagosGrupo = (g: any, fechaPrefix: string) => {
          const integrantes = g.integrantes ? g.integrantes.map((i: any) => i._id || i) : [];
          let totalEsperado = 0;
          let totalPagado = 0;
          for (const c of creditosAll) {
            const miembroId = c.miembro?._id || c.miembro;
            if (integrantes.includes(miembroId) && c.estado === 'Activo') {
              totalEsperado += (Number(c.pagoPactado) || 0);
              (c.pagos || [])
                .filter((p: any) => p.fechaPago && p.fechaPago.startsWith(fechaPrefix))
                .forEach((p: any) => {
                  if (!p.recuperacionSolidario) {
                    totalPagado += (Number(p.montoPagado) || Number(p.montoSolidario) || 0);
                  }
                });
            }
          }
          return { totalEsperado, totalPagado };
        };

        const calcPagosHistoricosGrupo = (g: any) => {
          const integrantes = g.integrantes ? g.integrantes.map((i: any) => i._id || i) : [];
          let totalPagado = 0;
          for (const c of creditosAll) {
            const miembroId = c.miembro?._id || c.miembro;
            if (integrantes.includes(miembroId) && c.estado === 'Activo') {
              (c.pagos || []).forEach((p: any) => {
                if (!p.recuperacionSolidario) {
                  totalPagado += (Number(p.montoPagado) || Number(p.montoSolidario) || 0);
                }
              });
            }
          }
          return totalPagado;
        };

        let gruposFiltrados = grupos;
        if (localStorage.getItem('userRole') === 'master') {
          const userStr = localStorage.getItem('user');
          const userObj = userStr ? JSON.parse(userStr) : null;
          const masterUsername = userObj?.username || '';
          const masterUserId = userObj?.id || '';
          gruposFiltrados = grupos.filter((g: any) => {
            if (!g.asesor) return false;
            if (typeof g.asesor === 'object') {
              const asesorId = g.asesor._id || g.asesor.id;
              const asesorUsername = g.asesor.username;
              return (masterUserId && asesorId === masterUserId) || (masterUsername && asesorUsername === masterUsername);
            }
            return masterUserId && g.asesor === masterUserId;
          });
        }

        const diaHoyNorm = normalize(this.hoyStr);

        // const esDiaCobro = (diaVisitaOPago: string): boolean => {
        //   if (!diaVisitaOPago) return false;
        //   const normalizado = normalize(diaVisitaOPago);

        //   if (normalizado === '15 de cada mes') {
        //     const date = hoy.getDate();
        //     const day = hoy.getDay(); // 0 = Domingo, 6 = Sábado

        //     // Si hoy es 15 y no es domingo
        //     if (date === 15 && day !== 0) {
        //       return true;
        //     }

        //     // Si el 15 cae en domingo, se cobra el día anterior (sábado 14).
        //     // Por lo tanto, si hoy es 14 y es sábado, entonces el 15 es domingo y toca cobrar hoy.
        //     if (date === 14 && day === 6) {
        //       return true;
        //     }

        //     return false;
        //   }

        //   return normalizado === diaHoyNorm;
        // };

        const esDiaCobro = (diaVisitaOPago: string): boolean => {
          if (!diaVisitaOPago) return false;
          const normalizado = normalize(diaVisitaOPago);
          const match = normalizado.match(/^(\d+)(?:\s+de\s+cada\s+mes)?$/);

          if (match) {
            const diaPactado = parseInt(match[1], 10); // día (1, 2, ..., 30)
            const date = hoy.getDate();
            const day = hoy.getDay(); // 0 = Domingo, 6 = Sábado

            // Validar si no es domingo
            if (date === diaPactado && day !== 0) {
              return true;
            }

            // Validar si pago cae sabado
            if (day === 6) {
              const manana = new Date(hoy);
              manana.setDate(hoy.getDate() + 1);

              // Validar si el dia de pago cae domingo 
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
          const integrantes = g.integrantes ? g.integrantes.map((i: any) => i._id || i) : [];
          let totalEsperado = 0;
          let totalPagado = 0;
          for (const c of creditosAll) {
            const miembroId = c.miembro?._id || c.miembro;
            if (integrantes.includes(miembroId)) {
              totalEsperado += (Number(c.pagoPactado) || 0);
              (c.pagos || [])
                .filter((p: any) => p.fechaPago && p.fechaPago.startsWith(fechaPrefix))
                .forEach((p: any) => {
                  if (!p.recuperacionSolidario) {
                    totalPagado += (Number(p.montoPagado) || Number(p.montoSolidario) || 0);
                  }
                });
            }
          }
          return { totalEsperado, totalPagado };
        };

        // Helper: pagos DESDE una fecha hasta hoy (para calcular monto restante y si ya se cerró)
        const calcPagosDesde = (g: any, fechaDesde: string) => {
          const integrantes = g.integrantes ? g.integrantes.map((i: any) => i._id || i) : [];
          let totalEsperado = 0;
          let totalPagado = 0;
          for (const c of creditosAll) {
            const miembroId = c.miembro?._id || c.miembro;
            if (integrantes.includes(miembroId) && c.estado === 'Activo') {
              totalEsperado += (Number(c.pagoPactado) || 0);
              // Sumar TODOS los pagos registrados a partir del día de visita (>= fechaDesde)
              (c.pagos || [])
                .filter((p: any) => p.fechaPago && p.fechaPago >= fechaDesde)
                .forEach((p: any) => {
                  if (!p.recuperacionSolidario) {
                    totalPagado += (Number(p.montoPagado) || Number(p.montoSolidario) || 0);
                  }
                });
            }
          }
          return { totalEsperado, totalPagado };
        };

        for (let delta = 1; delta <= 6; delta++) {
          const fecha = new Date(hoy);
          fecha.setDate(hoy.getDate() - delta);

          // Parar en domingo (no cruzar semana laboral)
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

            // PASO 1: ¿El grupo no pagó completo en su día de visita?
            const { totalEsperado: espDia, totalPagado: pagDia } = calcPagosEnFecha(g, fechaPrefix);
            const noPagoEnSuDia = espDia === 0 ? pagDia === 0 : pagDia < espDia;
            if (!noPagoEnSuDia) continue; // Sí pagó ese día no es atraso

            // PASO 2: ¿Sigue sin estar cubierto (incluyendo pagos tardíos registrados después)?
            const { totalEsperado, totalPagado } = calcPagosDesde(g, fechaPrefix);
            const sigueAbierto = totalEsperado === 0 ? totalPagado === 0 : totalPagado < totalEsperado;
            if (!sigueAbierto) continue; // Ya lo cubrieron (aunque con fecha posterior) → ocultar

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

        this.clienteService.getClientes().subscribe({
          next: (clientes: any[]) => {
            let clientesFiltrados = clientes || [];
            if (localStorage.getItem('userRole') === 'master') {
              const userStr = localStorage.getItem('user');
              const userObj = userStr ? JSON.parse(userStr) : null;
              const masterUsername = userObj?.username || '';
              const masterUserId = userObj?.id || '';
              clientesFiltrados = clientesFiltrados.filter((c: any) => {
                if (!c.asesor) return false;
                if (typeof c.asesor === 'object') {
                  const asesorId = c.asesor._id || c.asesor.id;
                  const asesorUsername = c.asesor.username;
                  return (masterUserId && asesorId === masterUserId) || (masterUsername && asesorUsername === masterUsername);
                }
                return masterUserId && c.asesor === masterUserId;
              });
            }

            const clientesDelDia = clientesFiltrados.filter((c: any) => esDiaCobro(c.diaPago));

            this.clientesHoy = clientesDelDia.filter((c: any) => {
              let totalPagadoHoy = 0;
              let totalEsperadoHoy = 0;
              let estaLiquidado = false;
              let totalPagadoHistorico = 0;

              const creditosCliente = creditosAll.filter((cred: any) =>
                (cred.tipoCredito === 'Individual' || cred.cliente) &&
                (cred.cliente?._id === c._id || cred.cliente === c._id)
              );
              const creditoCliente = creditosCliente.find((cred: any) => cred.estado === 'Activo') || creditosCliente[creditosCliente.length - 1];

              if (creditoCliente) {
                totalEsperadoHoy = Number(creditoCliente.pagoPactado) || 0;
                const pagosHoy = (creditoCliente.pagos || []).filter((p: any) =>
                  p.fechaPago && p.fechaPago.startsWith(hoyIsoPrefix)
                );
                pagosHoy.forEach((p: any) => {
                  totalPagadoHoy += (Number(p.montoPagado) || Number(p.montoSolidario) || 0);
                });

                (creditoCliente.pagos || []).forEach((p: any) => {
                  totalPagadoHistorico += (Number(p.montoPagado) || Number(p.montoSolidario) || 0);
                });

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
            this.cdr.detectChanges();
          },
          error: (err) => {
            console.error('Error al obtener clientes para el home:', err);
          }
        });
      },
      error: (err) => {
        console.error('Error al obtener datos combinados para el home:', err);
      }
    });
  }

  ngOnDestroy(): void {
    this.notificationService.limpiarTimerDiario();
  }
}