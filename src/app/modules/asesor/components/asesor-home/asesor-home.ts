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
          this.asesorName = userObj.username || 'Asesor';
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

    // Obtener prefix YYYY-MM-DD según zona horaria local para comparar con la BD
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

        // Verificar si hay grupos nuevos asignados → notificar
        this.notificationService.verificarNuevosGrupos(grupos);

        const gruposDelDia = grupos.filter((g: any) => {
          const diaVisita = g.diaVisita ? g.diaVisita.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase() : '';
          const diaActual = this.hoyStr.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
          return diaVisita === diaActual;
        });

        // Filtrar los que YA tienen un pago registrado hoy (por si ya se visitaron)
        this.gruposHoy = gruposDelDia.filter((g: any) => {
          const integrantes = g.integrantes ? g.integrantes.map((i: any) => i._id || i) : [];
          let tienePagoHoy = false;

          for (const c of creditosAll) {
            const miembroId = c.miembro?._id || c.miembro;
            if (integrantes.includes(miembroId)) {
              // Revisa si hay pagos que comiencen con la fecha de hoy
              if (c.pagos && c.pagos.some((p: any) => p.fechaPago && p.fechaPago.startsWith(hoyIsoPrefix))) {
                tienePagoHoy = true;
                break;
              }
              // O ahorros
              if (c.ahorro && c.ahorro.pagosAhorro && c.ahorro.pagosAhorro.some((a: any) => a.fecha && a.fecha.startsWith(hoyIsoPrefix))) {
                tienePagoHoy = true;
                break;
              }
            }
          }
          return !tienePagoHoy; // ¡Si NO tiene pago hoy, entonces se muestra!
        });

        // Programar notificaciones 10 minutos antes de la hora de visita de cada grupo
        this.notificationService.programarRecordatoriosVisita(this.gruposHoy);

        // ------------------------------------------------------------------------------------------------ //
        // LÓGICA PARA CLIENTES INDIVIDUALES
        // ------------------------------------------------------------------------------------------------ //
        this.clienteService.getClientes().subscribe({
          next: (clientes: any[]) => {
            console.log('Clientes obtenidos del servicio:', clientes);
            console.log('hoyStr actual:', this.hoyStr);

            const clientesDelDia = (clientes || []).filter((c: any) => {
              if (!c.diaPago) return false;

              // Remove accents and convert to lowercase for robust comparison
              const diaPago = c.diaPago.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
              const diaActual = this.hoyStr.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
              console.log(`Comparando diaPago [${diaPago}] con diaActual [${diaActual}] para cliente:`, c.nombre);
              return diaPago === diaActual;
            });

            console.log('Clientes del día:', clientesDelDia);

            this.clientesHoy = clientesDelDia.filter((c: any) => {
              let tienePagoHoy = false;
              let estaLiquidado = false;

              // Buscar el crédito de este cliente
              const creditoCliente = creditosAll.find((cred: any) =>
                (cred.tipoCredito === 'Individual' || cred.cliente) &&
                (cred.cliente?._id === c._id || cred.cliente === c._id)
              );
              console.log(`Crédito encontrado para ${c.nombre}:`, creditoCliente);

              if (creditoCliente) {
                if (creditoCliente.pagos && creditoCliente.pagos.some((p: any) => {
                  console.log(`Pago evaluado (${p.fechaPago}) vs ${hoyIsoPrefix}`);
                  return p.fechaPago && p.fechaPago.startsWith(hoyIsoPrefix)
                })) {
                  tienePagoHoy = true;
                }
                if (creditoCliente.estado === 'Liquidado') {
                  estaLiquidado = true;
                }
              }

              console.log(`tienePagoHoy: ${tienePagoHoy}, estaLiquidado: ${estaLiquidado} para cliente: ${c.nombre}`);

              // Ocultamos si ya tiene pago hoy, o si su crédito está liquidado
              return !tienePagoHoy && !estaLiquidado;
            });

            console.log('Clientes finales a mostrar:', this.clientesHoy);
            
            // Programar notificación diaria a las 9:15 AM con el resumen (incluyendo grupos e individuales)
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