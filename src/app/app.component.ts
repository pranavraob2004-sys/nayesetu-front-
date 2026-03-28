import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from './services/auth.service';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css']
})
export class AppComponent implements OnInit {
  restoringSession = true;

  constructor(
    private authService: AuthService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.restoreSession();
  }

  get isAuthenticated(): boolean {
    return this.authService.isAuthenticated;
  }

  get user(): any {
    return this.authService.user;
  }

  private async restoreSession() {
    this.restoringSession = true;
    await this.authService.ensureSessionLoaded();
    this.restoringSession = false;
  }

  logout() {
    this.authService.logout();
    this.router.navigateByUrl('/');
  }
}
