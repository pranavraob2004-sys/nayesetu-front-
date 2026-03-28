import { Injectable } from '@angular/core';
import { Provision } from 'src/app/models/provision.model';

@Injectable({ providedIn: 'root' })
export class AskService {
  private baseUrl = 'http://localhost:5000/api';
  private tokenKey = 'nayasetu_auth_token';

  private authHeaders(): Record<string, string> {
    const token = this.getToken();
    if (!token) return {};
    return { Authorization: `Bearer ${token}` };
  }

  getToken(): string | null {
    return localStorage.getItem(this.tokenKey);
  }

  setToken(token: string) {
    localStorage.setItem(this.tokenKey, token);
  }

  clearToken() {
    localStorage.removeItem(this.tokenKey);
  }

  async register(name: string, email: string, password: string): Promise<any> {
    const res = await fetch(`${this.baseUrl}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Registration failed');
    if (data.token) this.setToken(data.token);
    return data.user;
  }

  async login(email: string, password: string): Promise<any> {
    const res = await fetch(`${this.baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Login failed');
    if (data.token) this.setToken(data.token);
    return data.user;
  }

  async me(): Promise<any> {
    const res = await fetch(`${this.baseUrl}/auth/me`, {
      headers: this.authHeaders()
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Unauthorized');
    return data.user;
  }

  async getHistory(limit = 30): Promise<any[]> {
    const res = await fetch(`${this.baseUrl}/history?limit=${limit}`, {
      headers: this.authHeaders()
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to load history');
    return data.history || [];
  }

  async saveHistory(question: string, answer: string, provisions: Provision[]): Promise<number> {
    const res = await fetch(`${this.baseUrl}/history`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...this.authHeaders()
      },
      body: JSON.stringify({ question, answer, provisions })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to save history');
    return data.history_id;
  }

  async deleteHistory(historyId: number): Promise<void> {
    const res = await fetch(`${this.baseUrl}/history/${historyId}`, {
      method: 'DELETE',
      headers: this.authHeaders()
    });
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || 'Failed to delete history item');
    }
  }

  async fetchProvisions(question: string, targetLang: string = 'English'): Promise<Provision[]> {
    const res = await fetch(
      `${this.baseUrl}/article?question=${encodeURIComponent(question)}&target_lang=${encodeURIComponent(targetLang)}`
    );

    if (!res.ok) {
      throw new Error('Failed to fetch provisions');
    }

    const data = await res.json();
    return data.provisions || [];
  }

  streamExplanation(
    question: string,
    provisions: Provision[],
    onToken: (t: string) => void,
    onComplete: () => void,
    onError: () => void,
    targetLang: string = 'English'
  ): EventSource {
    const es = new EventSource(
      `${this.baseUrl}/explain/stream` +
      `?question=${encodeURIComponent(question)}` +
      `&provisions=${encodeURIComponent(JSON.stringify(provisions))}` +
      `&target_lang=${encodeURIComponent(targetLang)}`
    );

    es.onmessage = event => {
      if (event.data === '[DONE]') {
        es.close();
        onComplete();
        return;
      }
      onToken(event.data);
    };

    es.onerror = () => {
      es.close();
      onError();
    };

    return es;
  }
  async fetchRaw(question: string, targetLang: string = 'English'): Promise<any> {
    const res = await fetch(
      `${this.baseUrl}/article?question=${encodeURIComponent(question)}&target_lang=${encodeURIComponent(targetLang)}`
    );

    if (!res.ok) {
      throw new Error('Failed to fetch');
    }

    return res.json();
  }

  async transcribeAudio(audioBlob: Blob, language?: string): Promise<{ transcript: string; language?: string }> {
    const formData = new FormData();
    formData.append('audio', audioBlob, 'recording.webm');
    if (language) {
      formData.append('language', language);
    }

    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 70000);

    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}/stt`, {
        method: 'POST',
        headers: {
          ...this.authHeaders()
        },
        body: formData,
        signal: controller.signal
      });
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        throw new Error('Speech transcription timed out');
      }
      throw new Error('Speech transcription request failed');
    } finally {
      clearTimeout(timeoutId);
    }

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'STT failed');
    }

    return data;
  }

}
