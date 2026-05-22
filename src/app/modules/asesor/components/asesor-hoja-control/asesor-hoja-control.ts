import { Component, OnInit, Inject, PLATFORM_ID, ChangeDetectorRef } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { GrupoService } from '../../../../core/services/grupo.service';
import { FormsModule } from '@angular/forms';
import { forkJoin } from 'rxjs';
import Swal from 'sweetalert2';
import { AuthService } from '../../../../core/services/auth.service';
import { LocationService } from '../../../../core/services/location.service';

// Tipo para las pestañas
type TabTipo = 'COMUNAL' | 'REFIL' | 'MAGICO';

@Component({
  selector: 'app-asesor-hoja-control',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './asesor-hoja-control.html',
  styleUrl: './asesor-hoja-control.css',
})


export class AsesorHojaControl implements OnInit {
  // --- PROPERTIES ---
  asesorName: string = 'Asesor';
  hoyStr: string = '';
  grupoId: string | null = null;
  grupo: any = null;
  miembros: any[] = [];
  todosLosMiembros: any[] = [];
  cicloGrupo: string = '-';
  semanaActualGrupo: string = '-';
  pagos: { [miembroId: string]: any } = {};
  expandedMiembroId: string | null = null;
  showAhorroModal: boolean = false;
  currentTab: TabTipo = 'COMUNAL';
  numeroRecibos = { COMUNAL: '', REFIL: '', MAGICO: '' };

  constructor(
    @Inject(PLATFORM_ID) private platformId: Object,
    private route: ActivatedRoute,
    private router: Router,
    private grupoService: GrupoService,
    private authService: AuthService,
    private locationService: LocationService,
    private cdr: ChangeDetectorRef
  ) { }

  // --- LIFECYCLE HOOKS ---
  ngOnInit(): void {
    const dias = ['Domingo', 'Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes', 'Sabado'];
    this.hoyStr = dias[new Date().getDay()];
    this.loadUserData();

    this.route.paramMap.subscribe(params => {
      this.grupoId = params.get('id');
      if (this.grupoId) {
        this.cargarDatosGrupo(this.grupoId);
      }
    });
  }

  // --- UTILS ---
  private loadUserData(): void {
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
    }
  }


  // filtrar tipo de credito
  // Dentro de la clase AsesorHojaControl

  // Define un mapeo para normalizar los nombres de los tabs con tus datos en MongoDB
  private readonly MAP_TABS = {
    'COMUNAL': 'COMUNAL',
    'REFIL': 'REFILL', // Asegúrate que coincida con cómo lo guardas (ej. 'REFILL')
    'MAGICO': 'MAGICO'
  };

  get miembrosFiltrados() {
    if (!this.miembros) return [];

    // Filtramos los miembros cuyo tipoCredito coincida con el tab actual
    // Usamos toUpperCase o el mapa para asegurar la coincidencia
    return this.miembros.filter(m => {
      const tipo = m.tipoCredito?.toUpperCase();
      if (this.currentTab === 'COMUNAL') return tipo === 'CC';
      if (this.currentTab === 'REFIL') return tipo === 'R';
      if (this.currentTab === 'MAGICO') return tipo === 'MAGICO';
      return true;
    });
  }

  // --- UI CONTROLS ---
  cambiarTab(nuevaTab: TabTipo) {
    this.currentTab = nuevaTab;
    this.expandedMiembroId = null;
    this.cdr.detectChanges();
  }

  togglePagoForm(miembroId: string): void {
    if (this.expandedMiembroId === miembroId) {
      this.expandedMiembroId = null;
    } else {
      this.expandedMiembroId = miembroId;
    }
  }

  abrirModalAhorro(): void {
    this.showAhorroModal = true;
  }

  cerrarModalAhorro(): void {
    this.showAhorroModal = false;
  }

  // --- GETTERS ---
  // get miembrosFiltrados(): any[] {
  //   return this.miembros.filter(m => {
  //     const tipo = m.tipoCredito?.toUpperCase();
  //     if (this.currentTab === 'COMUNAL') return tipo === 'COMUNAL' || tipo === 'CC';
  //     if (this.currentTab === 'REFIL') return tipo === 'REFIL' || tipo === 'R';
  //     if (this.currentTab === 'MAGICO') return tipo === 'MAGICO' || tipo === 'MAGICO' || tipo === 'M';
  //     return false;
  //   });
  // }

  get totalEsperado(): number {
    return this.miembrosFiltrados.reduce((sum, m) => sum + (Number(m.pagoPactado) || 0), 0);
  }

  get totalCapturado(): number {
    return this.miembrosFiltrados.reduce((sum, m) => {
      const p = this.pagos[m._id];
      // Todo el dinero físico recibido: normal + apoyo + recuperacion
      const recuperacion = (p?.recuperacionSolidario) ? (Number(p?.montoRecuperacion) || 0) : 0;
      return sum + (Number(p?.monto) || 0) + (Number(p?.montoSolidario) || 0) + recuperacion;
    }, 0);
  }

  get totalExcedente(): number {
    return this.miembrosFiltrados.reduce((sum, m) => {
      const p = this.pagos[m._id];
      const pactado = Number(m.pagoPactado) || 0;
      const pagadoNormal = Number(p?.monto) || 0;
      const pagadoSolidario = (p?.solidario) ? (Number(p?.montoSolidario) || 0) : 0;

      let excedente = 0;
      if (pagadoNormal > pactado) {
        excedente += (pagadoNormal - pactado);
      }

      return sum + excedente;
    }, 0);
  }

  get totalDevuelto(): number {
    return this.miembrosFiltrados.reduce((sum, m) => {
      const p = this.pagos[m._id];
      const recuperacion = (p?.recuperacionSolidario) ? (Number(p?.montoRecuperacion) || 0) : 0;
      return sum + recuperacion;
    }, 0);
  }

  get miembrosConAhorro(): any[] {
    return this.miembrosFiltrados.filter(m => (m.ahorroTotal || 0) > 0);
  }

  get totalAhorradoGrupo(): number {
    return this.miembrosConAhorro.reduce((sum, m) => sum + (m.ahorroTotal || 0), 0);
  }

  // --- DATA FETCHING ---
  cargarDatosGrupo(id: string): void {
    this.grupoService.getGrupos().subscribe({
      next: (grupos: any[]) => {
        this.grupo = grupos.find(g => g._id === id);
        this.cdr.detectChanges();
      },
      error: (err) => console.error('Error al obtener grupos:', err)
    });

    forkJoin({
      miembrosAll: this.grupoService.getMiembros(),
      creditosAll: this.grupoService.getCreditos()
    }).subscribe({
      next: (res: any) => {
        this.processGrupoData(id, res);
      },
      error: (err) => console.error('Error al obtener datos combinados:', err)
    });
  }

  private processGrupoData(id: string, res: any): void {
    const miembrosAll = res.miembrosAll || [];
    const creditosAll = res.creditosAll.creditos || res.creditosAll || [];

    this.cicloGrupo = '-';
    this.semanaActualGrupo = '-';

    this.todosLosMiembros = miembrosAll;
    this.miembros = miembrosAll.filter((m: any) => (m.grupo?._id === id) || (m.grupo === id));
    this.miembros.forEach(m => {
      this.pagos[m._id] = {
        monto: 0,
        efectivoCredito: 0, transferenciaCredito: 0, depositoCredito: 0, tarjetaCredito: 0,
        ahorro: 0,
        efectivoAhorro: 0, transferenciaAhorro: 0, depositoAhorro: 0, tarjetaAhorro: 0,
        solidario: false,
        montoSolidario: 0,
        efectivoSolidario: 0, transferenciaSolidario: 0, depositoSolidario: 0, tarjetaSolidario: 0,
        beneficiariosSolidarios: [],
        fecha: new Date().toISOString().split('T')[0],
        metodoPago: '',
        metodoAhorro: '',
        metodoSolidario: '',
        selectedMetodosPago: [],
        selectedMetodosAhorro: [],
        selectedMetodosSolidario: []
      };

      const credito = creditosAll.find((c: any) => (c.miembro?._id === m._id) || (c.miembro === m._id));
      if (credito) {
        if (this.cicloGrupo === '-' && credito.ciclo) {
          this.cicloGrupo = credito.ciclo.toString();
        }
        if (this.semanaActualGrupo === '-' && credito.semanaActual) {
          this.semanaActualGrupo = credito.semanaActual.toString();
        }

        m.creditoId = credito._id;
        m.creditoTotal = credito.saldoTotal || 0;
        m.creditoPendiente = credito.saldoPendiente || 0;
        m.tipoCredito = credito.tipoCredito || 'CC';

        m.totalPagado = (credito.pagos || []).reduce((sum: number, p: any) => {
          if (p.recuperacionSolidario) return sum;
          let pagado = 0;
          if (p.pagoSolidario === true || p.pagoSolidario === 'true') {
            pagado = Number(p.montoSolidario) || 0;
          } else if (p.detallesSolidario && p.detallesSolidario.length > 0) {
            pagado = 0; // Dinero prestado a otros, no suma a su pagado
          } else {
            pagado = Number(p.montoPagado) || 0; // Pago normal
          }
          return sum + pagado;
        }, 0);
        m.pagoPactado = credito.pagoPactado || m.pagoPactado || 0;
        m.ahorroTotal = credito.ahorro?.montoTotal || 0;

        // El historial de ahorros (Garantía) se compone de dos fuentes:
        // 1. Movimientos independientes en ahorro.pagosAhorro
        const indep = (credito.ahorro?.pagosAhorro || []).map((p: any) => ({
          fecha: p.fecha,
          monto: p.monto
        }));

        // 2. Ahorros capturados durante los pagos semanales en la Hoja de Control
        const weekly = (credito.pagos || [])
          .filter((p: any) => (p.montoAhorro || 0) > 0)
          .map((p: any) => ({
            fecha: p.fechaPago,
            monto: p.montoAhorro
          }));

        // Combinamos ambas fuentes y ordenamos por fecha descendente
        // Usamos un Set o validación por fecha/monto si quisiéramos evitar duplicados exactos
        const totalMovements = [...indep, ...weekly].sort((a, b) =>
          new Date(b.fecha).getTime() - new Date(a.fecha).getTime()
        );

        m.pagosAhorro = totalMovements;

        m.historialSolidario = false;
        if (credito.pagos && credito.pagos.length > 0) {
          const mIdStr = m._id.toString();

          // Deudores: Pagos solidarios donde el que pagó NO es el mismo miembro
          const deudas = credito.pagos.filter((p: any) => {
            const isSolidario = p.pagoSolidario === true || p.pagoSolidario === 'true';
            if (!isSolidario) return false;
            const prestadorId = (p.quienPrestoSolidario?._id || p.quienPrestoSolidario || '').toString();
            return prestadorId !== '' && prestadorId !== mIdStr;
          });

          // Recuperaciones: Pagos marcados con la bandera recuperacionSolidario
          const recuperaciones = credito.pagos.filter((p: any) => {
            return p.recuperacionSolidario === true;
          });

          const prestadoresMap: any = {};
          deudas.forEach((p: any) => {
            const pId = (p.quienPrestoSolidario?._id || p.quienPrestoSolidario).toString();
            if (!prestadoresMap[pId]) {
              const pObj = miembrosAll.find((x: any) => x._id.toString() === pId);
              prestadoresMap[pId] = { nombre: pObj ? `${pObj.nombre} ${pObj.apellidos}` : 'Desconocido', prestado: 0, devuelto: 0 };
            }
            prestadoresMap[pId].prestado += (Number(p.montoSolidario || p.montoPagado) || 0);
          });

          let recuperacionesLibres = 0;
          recuperaciones.forEach((p: any) => {
            if (p.detallesSolidario && Array.isArray(p.detallesSolidario) && p.detallesSolidario.length > 0) {
              p.detallesSolidario.forEach((d: any) => {
                const pId = (d.miembro?._id || d.miembro).toString();
                if (prestadoresMap[pId]) {
                  prestadoresMap[pId].devuelto += (Number(d.monto) || 0);
                }
              });
            } else {
              recuperacionesLibres += (Number(p.montoSolidario || p.montoPagado) || 0);
            }
          });

          for (const pId in prestadoresMap) {
            const prest = prestadoresMap[pId];
            const maxDevolvible = prest.prestado - prest.devuelto;
            if (maxDevolvible > 0 && recuperacionesLibres > 0) {
              const descontar = Math.min(maxDevolvible, recuperacionesLibres);
              prest.devuelto += descontar;
              recuperacionesLibres -= descontar;
            }
          }

          m.prestadores = Object.keys(prestadoresMap).map(id => ({
            id,
            nombre: prestadoresMap[id].nombre,
            pendiente: prestadoresMap[id].prestado - prestadoresMap[id].devuelto
          })).filter(x => x.pendiente > 0);

          const totalAdeudadoSolidario = deudas.reduce((sum: number, p: any) => sum + (Number(p.montoSolidario || p.montoPagado) || 0), 0);
          const totalDevueltoSolidario = recuperaciones.reduce((sum: number, p: any) => sum + (Number(p.montoSolidario || p.montoPagado) || 0), 0);

          m.adeudadoSolidario = totalAdeudadoSolidario;
          m.devueltoSolidario = totalDevueltoSolidario;
          m.pendienteSolidario = totalAdeudadoSolidario - totalDevueltoSolidario;

          m.historialSolidario = m.pendienteSolidario > 0;

          this.pagos[m._id].recuperacionesDetalle = m.prestadores.map((pr: any) => ({ prestadorId: pr.id, monto: null }));
        }

        m.pagosHistoricos = credito.pagos || [];

        const todayStr = new Date().toISOString().split('T')[0];
        const pagosHoy = m.pagosHistoricos.filter((p: any) => p.fechaPago && p.fechaPago.startsWith(todayStr));
        const totalPagadoHoy = pagosHoy.reduce((sum: number, p: any) => {
          if (p.recuperacionSolidario) return sum;
          let pagadoParaMi = Number(p.montoPagado) || 0;
          if (p.pagoSolidario === true || p.pagoSolidario === 'true') {
            pagadoParaMi += Number(p.montoSolidario) || 0;
          }
          return sum + pagadoParaMi;
        }, 0);

        if (pagosHoy.length > 0) {
          const ultimoPago = pagosHoy[pagosHoy.length - 1];
          m.folioHoy = ultimoPago.numeroRecibo || 'Sin Folio';

          const tipo = m.tipoCredito?.toUpperCase();
          if (tipo === 'CC' && !this.numeroRecibos['COMUNAL']) this.numeroRecibos['COMUNAL'] = ultimoPago.numeroRecibo || '';
          if (tipo === 'R' && !this.numeroRecibos['REFIL']) this.numeroRecibos['REFIL'] = ultimoPago.numeroRecibo || '';
          if (tipo === 'MAGICO' && !this.numeroRecibos['MAGICO']) this.numeroRecibos['MAGICO'] = ultimoPago.numeroRecibo || '';
        }

        const cubrioPactado = m.pagoPactado > 0 ? (totalPagadoHoy >= m.pagoPactado) : (pagosHoy.length > 0);

        if (pagosHoy.length > 0 && cubrioPactado) {
          m.yaPagoHoy = true;
        } else {
          m.yaPagoHoy = false;
        }

      } else {
        m.creditoTotal = 0;
        m.creditoPendiente = 0;
        m.tipoCredito = '-';
        m.totalPagado = 0;
        m.pagoPactado = m.pagoPactado || 0;
        m.ahorroTotal = 0;
        m.pagosAhorro = [];
        m.historialSolidario = false;
        m.yaPagoHoy = false;
      }

      this.pagos[m._id].monto = 0;
      this.pagos[m._id].recuperacionSolidario = false;
      this.pagos[m._id].montoRecuperacion = 0;
    });
    this.cdr.detectChanges();
  }

  // --- FORM HANDLERS ---
  onPagoChange(): void {
    this.cdr.detectChanges();
  }

  getMetodoField(metodo: string, rubro: string): string {
    const mapPago: any = { 'E': 'efectivoCredito', 'T': 'transferenciaCredito', 'D': 'depositoCredito', 'TJ': 'tarjetaCredito' };
    const mapAhorro: any = { 'E': 'efectivoAhorro', 'T': 'transferenciaAhorro', 'D': 'depositoAhorro', 'TJ': 'tarjetaAhorro' };
    const mapSolidario: any = { 'E': 'efectivoSolidario', 'T': 'transferenciaSolidario', 'D': 'depositoSolidario', 'TJ': 'tarjetaSolidario' };

    if (rubro === 'pago') return mapPago[metodo];
    if (rubro === 'ahorro') return mapAhorro[metodo];
    return mapSolidario[metodo];
  }

  getFullNameMetodo(sigla: string): string {
    const map: any = { 'E': 'EFECTIVO', 'T': 'TRANSFERENCIA', 'D': 'DEPOSITO', 'TJ': 'TARJETA' };
    return map[sigla] || 'EFECTIVO';
  }

  calcularTotalManual(miembroId: string, rubro: string) {
    const p = this.pagos[miembroId];
    if (rubro === 'pago') {
      p.monto = (Number(p.efectivoCredito) || 0) + (Number(p.transferenciaCredito) || 0) + (Number(p.depositoCredito) || 0) + (Number(p.tarjetaCredito) || 0);
    } else if (rubro === 'ahorro') {
      p.ahorro = (Number(p.efectivoAhorro) || 0) + (Number(p.transferenciaAhorro) || 0) + (Number(p.depositoAhorro) || 0) + (Number(p.tarjetaAhorro) || 0);
    } else {
      p.montoSolidario = (Number(p.efectivoSolidario) || 0) + (Number(p.transferenciaSolidario) || 0) + (Number(p.depositoSolidario) || 0) + (Number(p.tarjetaSolidario) || 0);
    }
    this.onPagoChange();
  }

  syncGlobalMonto(miembroId: string, rubro: string) {
    const p = this.pagos[miembroId];
    const key = rubro === 'pago' ? 'selectedMetodosPago' : rubro === 'ahorro' ? 'selectedMetodosAhorro' : 'selectedMetodosSolidario';
    if (p[key].length === 1) {
      const field = this.getMetodoField(p[key][0], rubro);
      if (rubro === 'pago') p[field] = p.monto;
      else if (rubro === 'ahorro') p[field] = p.ahorro;
      else if (rubro === 'solidario') p[field] = p.montoSolidario;
    }
  }

  toggleMetodo(miembroId: string, metodo: string, rubro: 'pago' | 'ahorro' | 'solidario'): void {
    const p = this.pagos[miembroId];
    if (!p) return;

    const selectedKey = rubro === 'pago' ? 'selectedMetodosPago' : rubro === 'ahorro' ? 'selectedMetodosAhorro' : 'selectedMetodosSolidario';
    const metodoKey = rubro === 'pago' ? 'metodoPago' : rubro === 'ahorro' ? 'metodoAhorro' : 'metodoSolidario';

    const selectedMetodos = p[selectedKey];
    const index = selectedMetodos.indexOf(metodo);

    if (index > -1) {
      if (selectedMetodos.length > 1) {
        selectedMetodos.splice(index, 1);
        p[this.getMetodoField(metodo, rubro)] = 0;
        this.calcularTotalManual(miembroId, rubro);
      }
    } else {
      selectedMetodos.push(metodo);
      this.syncGlobalMonto(miembroId, rubro);
    }

    p[metodoKey] = selectedMetodos.length > 1 ? 'MIXTO' : this.getFullNameMetodo(selectedMetodos[0] || 'E');
    this.onPagoChange();
  }

  isMetodoSelected(miembroId: string, metodo: string, rubro: 'pago' | 'ahorro' | 'solidario'): boolean {
    const p = this.pagos[miembroId];
    if (!p) return false;

    const selectedKey = rubro === 'pago' ? 'selectedMetodosPago' : rubro === 'ahorro' ? 'selectedMetodosAhorro' : 'selectedMetodosSolidario';
    return p[selectedKey]?.includes(metodo) || false;
  }

  // --- HTTP PAYLOAD BUILDERS ---
  private buildPagoRequest(p: any, tipo: 'normal' | 'solidario', includeAhorro: boolean, coords: any): any {
    const payload: any = {
      fechaPago: p.fecha,
      pagoSolidario: tipo === 'solidario',
      metodoPago: tipo === 'normal' ? p.metodoPago : p.metodoSolidario,
      numeroRecibo: this.numeroRecibos[this.currentTab],
      ...(coords ? { ubicacion: coords } : {})
    };

    if (tipo === 'normal') {
      payload.montoPagado = Number(p.monto) || 0;
      payload.efectivoCredito = Number(p.efectivoCredito) || 0;
      payload.transferenciaCredito = Number(p.transferenciaCredito) || 0;
      payload.depositoCredito = Number(p.depositoCredito) || 0;
      payload.tarjetaCredito = Number(p.tarjetaCredito) || 0;
    } else {
      // Se igualan para que el backend los registre, ya que el generador del PDF lee directamente 'montoPagado'
      payload.montoPagado = Number(p.montoSolidario) || 0;
      payload.montoSolidario = Number(p.montoSolidario) || 0;

      // Sumar los métodos de pago de cada beneficiario individualmente
      payload.efectivoSolidario = p.beneficiariosSolidarios.filter((b: any) => b.metodo === 'E').reduce((sum: number, b: any) => sum + (Number(b.monto) || 0), 0);
      payload.transferenciaSolidario = p.beneficiariosSolidarios.filter((b: any) => b.metodo === 'T').reduce((sum: number, b: any) => sum + (Number(b.monto) || 0), 0);
      payload.depositoSolidario = p.beneficiariosSolidarios.filter((b: any) => b.metodo === 'D').reduce((sum: number, b: any) => sum + (Number(b.monto) || 0), 0);
      payload.tarjetaSolidario = p.beneficiariosSolidarios.filter((b: any) => b.metodo === 'TJ').reduce((sum: number, b: any) => sum + (Number(b.monto) || 0), 0);

      const usedMethods = [payload.efectivoSolidario, payload.transferenciaSolidario, payload.depositoSolidario, payload.tarjetaSolidario].filter(v => v > 0);
      const isMixto = usedMethods.length > 1;

      if (p.beneficiariosSolidarios.length > 0) {
        payload.metodoPago = isMixto ? 'MIXTO' : this.getFullNameMetodo(p.beneficiariosSolidarios[0].metodo);
      } else {
        payload.metodoPago = 'EFECTIVO';
      }

      payload.beneficiarios = p.beneficiariosSolidarios.map((b: any) => ({
        miembro: b.miembro,
        monto: Number(b.monto),
        efectivoSolidario: b.metodo === 'E' ? Number(b.monto) : 0,
        transferenciaSolidario: b.metodo === 'T' ? Number(b.monto) : 0,
        depositoSolidario: b.metodo === 'D' ? Number(b.monto) : 0,
        tarjetaSolidario: b.metodo === 'TJ' ? Number(b.monto) : 0,
      }));
    }

    if (includeAhorro && Number(p.ahorro) > 0) {
      payload.montoAhorro = Number(p.ahorro);
      payload.efectivoAhorro = Number(p.efectivoAhorro) || 0;
      payload.transferenciaAhorro = Number(p.transferenciaAhorro) || 0;
      payload.depositoAhorro = Number(p.depositoAhorro) || 0;
      payload.tarjetaAhorro = Number(p.tarjetaAhorro) || 0;
    }

    return payload;
  }

  private buildAhorroRequest(p: any, coords: any): any {
    return {
      monto: Number(p.ahorro) || 0,
      fecha: p.fecha,
      efectivo: Number(p.efectivoAhorro) || 0,
      transferencia: Number(p.transferenciaAhorro) || 0,
      deposito: Number(p.depositoAhorro) || 0,
      tarjeta: Number(p.tarjetaAhorro) || 0,
      numeroRecibo: this.numeroRecibos[this.currentTab],
      ...(coords ? { ubicacion: coords } : {})
    };
  }

  // --- SUBMIT HANDLING ---
  guardarPagos(): void {
    const numRecibo = String(this.numeroRecibos[this.currentTab]).trim();
    if (!numRecibo) {
      Swal.fire('Atención', 'El número de recibo es obligatorio para guardar los datos.', 'warning');
      return;
    }

    // Verificar que no se repita el número en otra fecha o en otra pestaña
    const todayStr = new Date().toISOString().split('T')[0];
    let reciboInvalido = false;

    for (const m of this.todosLosMiembros) {
      if (m.pagosHistoricos) {
        for (const pago of m.pagosHistoricos) {
          if (pago.numeroRecibo === numRecibo) {
            const esMismoDia = pago.fechaPago && pago.fechaPago.startsWith(todayStr);
            let esMismoTipo = false;
            if (this.currentTab === 'COMUNAL' && m.tipoCredito === 'CC') esMismoTipo = true;
            if (this.currentTab === 'REFIL' && m.tipoCredito === 'R') esMismoTipo = true;
            if (this.currentTab === 'MAGICO' && m.tipoCredito === 'MAGICO') esMismoTipo = true;

            if (!esMismoDia || !esMismoTipo) {
              reciboInvalido = true;
              break;
            }
          }
        }
      }
      if (reciboInvalido) break;
    }

    if (reciboInvalido) {
      Swal.fire('Atención', `El número de recibo "${numRecibo}" ya fue utilizado anteriormente o pertenece a otro grupo. Por favor, utiliza un folio diferente.`, 'warning');
      return;
    }

    const pagosFilterIds = Object.keys(this.pagos);

    // Primero validamos
    let hasData = false;
    for (const miembroId of pagosFilterIds) {
      const p = this.pagos[miembroId];
      if (p.monto > 0 || p.ahorro > 0 || (p.solidario && p.montoSolidario > 0) || p.recuperacionSolidario) hasData = true;

      const m = this.miembros.find(x => x._id === miembroId);

      // Validación Solidario (Ayuda a otros)
      if (p.solidario) {
        if (!p.beneficiariosSolidarios || p.beneficiariosSolidarios.length === 0) {
          Swal.fire('Atención', `Por favor agrega al menos un beneficiario para el apoyo solidario de ${m?.nombre}`, 'warning');
          return;
        }

        for (const ben of p.beneficiariosSolidarios) {
          if (!ben.miembro || !ben.monto || ben.monto <= 0) {
            Swal.fire('Atención', `Por favor completa correctamente los beneficiarios del apoyo para ${m?.nombre}`, 'warning');
            return;
          }
        }
      }
    }

    if (!hasData) {
      Swal.fire('Aviso', 'No hay pagos ni ahorros que guardar.', 'info');
      return;
    }

    // Mostrar loading y obtener GPS antes de construir los requests
    Swal.fire({
      title: 'Obteniendo ubicación...',
      text: 'Por favor espere',
      allowOutsideClick: false,
      didOpen: () => { Swal.showLoading(); }
    });

    this.locationService.getCoordsFresh().then(coords => {
      const peticiones: any[] = [];
      for (const miembroId of pagosFilterIds) {
        const p = this.pagos[miembroId];
        const miembroActual = this.miembros.find(m => m._id === miembroId);

        if (!miembroActual || !miembroActual.creditoId) continue;

        const tienePagoNormal = Number(p.monto) > 0;
        const tieneSolidario = p.solidario && p.beneficiariosSolidarios && p.beneficiariosSolidarios.length > 0;
        const tieneAhorro = Number(p.ahorro) > 0;
        const esRecuperacion = p.recuperacionSolidario && Number(p.montoRecuperacion) > 0;
        if (tienePagoNormal) {
          peticiones.push(this.grupoService.registrarPago(miembroActual.creditoId, this.buildPagoRequest(p, 'normal', tieneAhorro, coords)));
        }

        if (esRecuperacion) {
          const reqRecup: any = {
            montoPagado: 0,
            montoSolidario: Number(p.montoRecuperacion) || 0,
            efectivoSolidario: Number(p.montoRecuperacion) || 0,
            fechaPago: p.fecha,
            metodoPago: 'EFECTIVO',
            numeroRecibo: this.numeroRecibos[this.currentTab],
            recuperacionSolidario: true,
            pagoSolidario: false,
            miembro: miembroActual._id,
            ...(coords ? { ubicacion: coords } : {})
          };

          if (p.recuperacionesDetalle && p.recuperacionesDetalle.length > 0) {
            reqRecup.beneficiarios = p.recuperacionesDetalle
              .filter((d: any) => Number(d.monto) > 0)
              .map((d: any) => ({ miembro: d.prestadorId, monto: Number(d.monto) }));
          }

          peticiones.push(this.grupoService.registrarPago(miembroActual.creditoId, reqRecup));
        }

        if (tieneSolidario) {
          peticiones.push(this.grupoService.registrarPago(miembroActual.creditoId, this.buildPagoRequest(p, 'solidario', false, coords)));
        }

        if (tieneAhorro && !tienePagoNormal) {
          peticiones.push(this.grupoService.registrarAhorro(miembroActual.creditoId, this.buildAhorroRequest(p, coords)));
        }
      }

      if (peticiones.length === 0) {
        Swal.fire('Aviso', 'No hay peticiones para procesar.', 'info');
        return;
      }

      Swal.update({ title: 'Guardando...', text: 'Por favor espere' });

      forkJoin(peticiones).subscribe({
        next: (responses) => {
          const isOffline = responses.some(r => r.offline);
          const message = isOffline
            ? 'Los pagos se han guardado localmente (Sin internet) y se subirán al servidor automáticamente al recuperar la señal.'
            : 'Pagos registrados correctamente';

          Swal.fire('Éxito', message, 'success').then(() => {
            this.router.navigate(['/home-asesor']);
          });
        },
        error: (err) => {
          Swal.fire('Error', 'Hubo un error al registrar los pagos', 'error');
          console.error(err);
        }
      });
    });
  }

  // --- NAVIGATION ---
  volver(): void {
    this.router.navigate(['/home-asesor']);
  }

  logout(): void {
    this.authService.logout();
    this.router.navigate(['/login']);
  }

  irAInicio(): void {
    this.router.navigate(['/home-asesor']);
  }

  agregarBeneficiario(miembroId: string): void {
    if (!this.pagos[miembroId].beneficiariosSolidarios) {
      this.pagos[miembroId].beneficiariosSolidarios = [];
    }
    this.pagos[miembroId].beneficiariosSolidarios.push({ miembro: '', monto: null, metodo: 'E' });
  }

  eliminarBeneficiario(miembroId: string, index: number): void {
    this.pagos[miembroId].beneficiariosSolidarios.splice(index, 1);
    this.recalcularMontoSolidario(miembroId);
  }

  recalcularMontoSolidario(miembroId: string): void {
    const p = this.pagos[miembroId];
    p.montoSolidario = p.beneficiariosSolidarios.reduce((sum: number, b: any) => sum + (Number(b.monto) || 0), 0);
    this.onPagoChange();
  }

  recalcularMontoRecuperacion(miembroId: string): void {
    const p = this.pagos[miembroId];
    if (p.recuperacionesDetalle && p.recuperacionesDetalle.length > 0) {
      p.montoRecuperacion = p.recuperacionesDetalle.reduce((sum: number, b: any) => sum + (Number(b.monto) || 0), 0);
    }
    this.onPagoChange();
  }

}





