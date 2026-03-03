import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { DexieService } from '../../../core/database/dexie.service';
import { firstValueFrom } from 'rxjs';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [FormsModule, CommonModule],
  templateUrl: './login.html',
  styleUrl: './login.css',
})
export class LoginComponent {
  loginData = { username: '', password: '' };
  showPassword = false;

  // Estados de control
  errorMessage: string | null = null;
  isLoading = false;

  constructor(
    private http: HttpClient,
    private dexie: DexieService,
    private router: Router
  ) { }

  async onLogin() {
    this.errorMessage = null; // Limpiar errores previos

    // 1. Validación de campos vacíos
    if (!this.loginData.username.trim() || !this.loginData.password.trim()) {
      this.errorMessage = 'Por favor, completa todos los campos.';
      return;
    }

    this.isLoading = true;

    if (navigator.onLine) {
      try {
        const response: any = await firstValueFrom(
          this.http.post('http://localhost:3000/api/users/login', this.loginData)
        );

        // Guardar sesión en Dexie
        await this.dexie.user_session.put({
          user: String(this.loginData.username),
          token: String(response.token),
          role: response.user.role,
          lastLogin: Date.now()
        });

        localStorage.setItem('userRole', response.user.role);
        localStorage.setItem('isLoggedIn', 'true');

        this.redirectByRole(response.user.role);

      } catch (error) {
        this.handleLoginError(error);
      } finally {
        this.isLoading = false;
      }
    } else {
      // Flujo Offline
      await this.attemptOfflineLogin();
      this.isLoading = false;
    }
  }

  private handleLoginError(error: any) {
    if (error instanceof HttpErrorResponse) {
      if (error.status === 401 || error.status === 403) {
        this.errorMessage = 'Usuario o contraseña incorrectos.';
      } else if (error.status === 0) {
        // Error de conexión (Servidor apagado o error de red)
        console.warn('Servidor no disponible, intentando login offline...');
        this.attemptOfflineLogin();
      } else {
        this.errorMessage = 'Error en el servidor. Inténtalo más tarde.';
      }
    } else {
      this.errorMessage = 'Ocurrió un error inesperado.';
    }
  }

  private async attemptOfflineLogin() {
    const localUser = await this.dexie.user_session.get(this.loginData.username);

    if (localUser) {
      // Opcional: Validar que el password coincida si lo guardas localmente (Hashed)
      // Por ahora, permitimos el paso si el usuario ya inició sesión antes en este equipo
      localStorage.setItem('userRole', localUser.role);
      localStorage.setItem('isLoggedIn', 'true');
      this.redirectByRole(localUser.role);
    } else {
      this.errorMessage = 'No hay datos de acceso guardados para este usuario o no hay conexión.';
    }
  }

  private redirectByRole(role: string) {
    if (role === 'admin') {
      this.router.navigate(['/home-admin']);
    } else {
      this.router.navigate(['/home-asesor']);
    }
  }
}