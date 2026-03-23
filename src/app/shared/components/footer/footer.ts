import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';

@Component({
  selector: 'app-footer',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './footer.html',
  styleUrl: './footer.css',
})
export class Footer {
  constructor(private router: Router) { }

  get isAsesorPage(): boolean {
    return (this.router.url.includes('asesor') && !this.router.url.includes('mapa-asesores')) || this.router.url.includes('hoja-control-individual');
  }

  get isLoginPage(): boolean {
    return this.router.url.includes('login') || this.router.url === '/';
  }
}
