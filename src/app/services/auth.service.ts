import { Injectable } from '@angular/core';
import { AskService } from 'src/ask.service';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private _user: any = null;
  private sessionReady = false;
  private loadingPromise: Promise<void> | null = null;

  constructor(private askService: AskService) {}

  get user(): any {
    return this._user;
  }

  get isAuthenticated(): boolean {
    return !!this._user;
  }

  async ensureSessionLoaded(): Promise<void> {
    if (this.sessionReady) return;
    if (this.loadingPromise) return this.loadingPromise;

    this.loadingPromise = (async () => {
      const token = this.askService.getToken();
      if (!token) {
        this._user = null;
        this.sessionReady = true;
        return;
      }
      try {
        this._user = await this.askService.me();
      } catch {
        this.askService.clearToken();
        this._user = null;
      } finally {
        this.sessionReady = true;
      }
    })();

    await this.loadingPromise;
    this.loadingPromise = null;
  }

  async login(email: string, password: string): Promise<any> {
    this._user = await this.askService.login(email, password);
    this.sessionReady = true;
    return this._user;
  }

  async register(name: string, email: string, password: string): Promise<any> {
    this._user = await this.askService.register(name, email, password);
    this.sessionReady = true;
    return this._user;
  }

  logout() {
    this.askService.clearToken();
    this._user = null;
    this.sessionReady = true;
  }
}
