import { Component, OnInit, Inject, PLATFORM_ID, ChangeDetectorRef } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import Swal from 'sweetalert2';
import { MagicoService } from '../../../../core/services/magico.service';
import { GrupoService } from '../../../../core/services/grupo.service';

@Component({
  selector: 'app-magico-hoja',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './magico-hoja.html',
  styleUrl: './magico-hoja.css'
})
export class MagicoHoja implements OnInit {
  grupos: any[] = [];
  grupoId: string = '';
  grupo: any = null;
  creditos: any[] = [];
  incluirLiquidados: boolean = false;
  expandidoId: string | null = null;
  cargando: boolean = false;

  constructor(
    @Inject(PLATFORM_ID) private platformId: Object,
    private route: ActivatedRoute,
    private router: Router,
    private magicoService: MagicoService,
    private grupoService: GrupoService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    if (isPlatformBrowser(this.platformId)) {
      this.cargarGrupos();
      this.route.paramMap.subscribe(params => {
        const id = params.get('grupoId');
        if (id) {
          this.grupoId = id;
          this.cargarHoja(id);
        }
      });
    }
  }

  cargarGrupos(): void {
    this.grupoService.getGrupos().subscribe({
      next: (data) => {
        this.grupos = Array.isArray(data) ? data : [];
        this.cdr.detectChanges();
      },
      error: (err) => console.error('Error al cargar grupos:', err)
    });
  }

  onGrupoChange(): void {
    if (this.grupoId) {
      this.router.navigate(['/magicos-hoja', this.grupoId]);
    } else {
      this.grupo = null;
      this.creditos = [];
    }
  }

  cargarHoja(id: string): void {
    if (!id) return;
    this.cargando = true;
    this.magicoService.getHojaGrupoMagicos(id, this.incluirLiquidados).subscribe({
      next: (res) => {
        this.grupo = res?.grupo || null;
        this.creditos = res?.creditos || [];
        this.cargando = false;
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error('Error cargando hoja mágicos:', err);
        this.cargando = false;
        Swal.fire('Error', err?.error?.msg || 'No se pudo cargar la hoja de mágicos.', 'error');
        this.cdr.detectChanges();
      }
    });
  }

  toggleExpandir(creditoId: string): void {
    this.expandidoId = this.expandidoId === creditoId ? null : creditoId;
  }

  totalPagadoCredito(c: any): number {
    return (c?.pagos || []).reduce((sum: number, p: any) => sum + (Number(p.montoPagado) || 0), 0);
  }

  get sumaMontoSolicitado(): number {
    return this.creditos.reduce((s, c) => s + (Number(c.montoSolicitado) || 0), 0);
  }

  get sumaPactado(): number {
    return this.creditos.reduce((s, c) => s + (Number(c.pagoPactado) || 0), 0);
  }

  get sumaSaldoPendiente(): number {
    return this.creditos.reduce((s, c) => s + (Number(c.saldoPendiente) || 0), 0);
  }

  abrirFormatoPdf(): void {
    Swal.fire({
      icon: 'info',
      title: 'Formato PDF de Mágicos',
      text: 'El formato personalizado de Hoja PDF para Créditos Mágicos se integrará en la siguiente etapa.',
      confirmButtonColor: '#7c3aed'
    });
  }
}

