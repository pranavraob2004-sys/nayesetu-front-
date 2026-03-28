import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

@Component({
  selector: 'app-login',
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.css']
})
export class LoginComponent {
  email = '';
  password = '';
  error = '';
  loading = false;

  constructor(
    private authService: AuthService,
    private router: Router
  ) {}

  async submit() {
    if (!this.email.trim() || !this.password.trim() || this.loading) return;
    this.loading = true;
    this.error = '';
    try {
      await this.authService.login(this.email, this.password);
      this.router.navigateByUrl('/workspace');
    } catch (e: any) {
      this.error = e?.message || 'Login failed';
    } finally {
      this.loading = false;
    }
  }
}
