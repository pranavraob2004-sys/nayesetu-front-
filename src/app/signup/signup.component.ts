import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

@Component({
  selector: 'app-signup',
  templateUrl: './signup.component.html',
  styleUrls: ['./signup.component.css']
})
export class SignupComponent {
  name = '';
  email = '';
  password = '';
  error = '';
  loading = false;

  constructor(
    private authService: AuthService,
    private router: Router
  ) {}

  async submit() {
    if (!this.name.trim() || !this.email.trim() || !this.password.trim() || this.loading) return;
    this.loading = true;
    this.error = '';
    try {
      await this.authService.register(this.name, this.email, this.password);
      this.router.navigateByUrl('/workspace');
    } catch (e: any) {
      this.error = e?.message || 'Sign up failed';
    } finally {
      this.loading = false;
    }
  }
}
