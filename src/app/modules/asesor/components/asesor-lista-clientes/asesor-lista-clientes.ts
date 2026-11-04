import { Component, OnInit, ChangeDetectorRef, Inject, PLATFORM_ID, Injector, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import Swal from 'sweetalert2';
import { environment } from '../../../../../environments/environment';
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

  // Modal de Vista Previa (Solo Lectura)
  previewUrl: string | null = null;
  previewSafeUrl: SafeResourceUrl | null = null;
  previewClienteNombre: string = '';

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
    private authService: AuthService,
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

  cargarClientes(forceRefresh = false): void {
    this.cargando = true;
    this.cdr.markForCheck();

    this.clienteService.getClientesConCredito(forceRefresh).subscribe({
      next: (clientes: any) => {
        let clientesBase = Array.isArray(clientes) ? clientes : [];
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
          clientesBase = clientesBase.filter(matchAsesor);
        }

        const year = new Date().getFullYear();
        const month = String(new Date().getMonth() + 1).padStart(2, '0');
        const day = String(new Date().getDate()).padStart(2, '0');
        const hoyIsoPrefix = `${year}-${month}-${day}`;

        this.clientesConCredito = clientesBase.map((c: any) => {
          const creditoCliente = c.creditoActivo || null;
          let estado = 'Sin Crédito';
          let tienePagoHoy = c.tienePagoHoy || false;

          if (creditoCliente) {
            estado = creditoCliente.estado || 'Activo';
            if (!tienePagoHoy && creditoCliente.pagos && creditoCliente.pagos.some((p: any) => p.fechaPago && p.fechaPago.startsWith(hoyIsoPrefix))) {
              tienePagoHoy = true;
            }
          }

          return {
            ...c,
            creditoActivo: creditoCliente,
            montoPactado: c.montoPactado !== undefined ? c.montoPactado : (creditoCliente ? creditoCliente.pagoPactado : 0),
            estadoFiltro: c.estadoFiltro || (estado === 'Liquidado' ? 'Liquidados' : (estado === 'Sin Crédito' ? 'Todos' : 'Activos')),
            tienePagoHoy: tienePagoHoy,
            diaVisitaStr: c.diaVisitaStr || (c.diaPago ? c.diaPago.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase() : '')
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

  getCicloActualCliente(cliente: any): number {
    if (!cliente) return 1;
    const cred = cliente.creditoActivo;
    if (cred && Number(cred.ciclo) > 0) return Number(cred.ciclo);
    return Number(cliente.cicloActual) || 1;
  }

  getSemanasCliente(cliente: any): number {
    if (!cliente) return 16;
    const cred = cliente.creditoActivo;
    if (cred && Number(cred.semanas) > 0) return Number(cred.semanas);
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

  async vistaPreviaIndividual(cliente: any, event?: Event): Promise<void> {
    if (event) event.stopPropagation();

    const ciclo = this.getCicloActualCliente(cliente);
    const totalSemanas = this.getSemanasCliente(cliente);
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
            <select id="swal-tipo-hoja-ind-list" style="width: 100%; padding: 8px 12px; border: 1px solid #cbd5e1; border-radius: 8px; font-size: 14px; background-color: #fff;">
              <option value="llena">Hoja Llena (con datos)</option>
              <option value="vacia">Hoja Vacía (en blanco)</option>
            </select>
          </div>
          <div>
            <label style="display: block; font-size: 11px; font-weight: 700; color: #475569; text-transform: uppercase; margin-bottom: 4px;">Rango de Semanas (${totalSemanas} semanas)</label>
            <select id="swal-rango-semanas-ind-list" style="width: 100%; padding: 8px 12px; border: 1px solid #cbd5e1; border-radius: 8px; font-size: 14px; background-color: #fff;">
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
        const tipoElem = document.getElementById('swal-tipo-hoja-ind-list') as HTMLSelectElement;
        const rangoElem = document.getElementById('swal-rango-semanas-ind-list') as HTMLSelectElement;
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
    this.previewClienteNombre = nombre;
    this.previewUrl = url;
    this.previewSafeUrl = this.sanitizer.bypassSecurityTrustResourceUrl(`${url}#toolbar=0`);
    this.cdr.markForCheck();
  }

  cerrarPreview(): void {
    this.previewUrl = null;
    this.previewSafeUrl = null;
    this.previewClienteNombre = '';
    this.cdr.markForCheck();
  }

  abrirEnNuevaPestana(): void {
    if (this.previewUrl) {
      window.open(`${this.previewUrl}#toolbar=0`, '_blank');
    }
  }

  verDetalleCliente(clienteId: string): void {
    this.router.navigate(['/hoja-control-individual', clienteId]);
  }

  volverAInicio(): void {
    this.router.navigate(['/home-asesor']);
  }
}
