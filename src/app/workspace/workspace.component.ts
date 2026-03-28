import { Component, NgZone, OnDestroy, OnInit } from '@angular/core';
import { AskService } from 'src/ask.service';
import { Provision } from '../models/provision.model';
import { AuthService } from '../services/auth.service';

interface HistoryItem {
  history_id: number;
  question: string;
  answer: string;
  provisions: Provision[];
  created_at?: string;
}

@Component({
  selector: 'app-workspace',
  templateUrl: './workspace.component.html',
  styleUrls: ['./workspace.component.css']
})
export class WorkspaceComponent implements OnInit, OnDestroy {
  responseMode: 'English' | 'Hindi' | 'Hinglish' = 'English';
  resolvedResponseMode = 'English';

  question = '';
  loading = false;
  error = '';
  speechError = '';
  speechSupported = false;
  backendSttSupported = false;
  backendSttPreferred = false;
  isListening = false;
  isTranscribing = false;

  provisions: Provision[] = [];
  explanation = '';

  history: HistoryItem[] = [];
  historyLoading = false;
  activeHistoryMenuId: number | null = null;

  private currentStream: EventSource | null = null;
  private recognition: any = null;
  private speechBuffer = '';
  private mediaRecorder: MediaRecorder | null = null;
  private mediaStream: MediaStream | null = null;
  private audioChunks: Blob[] = [];
  private activeVoiceMode: 'backend' | 'browser' | null = null;
  private readonly maxAudioBytes = 10 * 1024 * 1024;

  constructor(
    private askService: AskService,
    private authService: AuthService,
    private zone: NgZone
  ) {}

  ngOnInit(): void {
    this.initBackendRecorderSupport();
    this.initSpeechRecognition();

    const prefill = localStorage.getItem('nayasetu_home_prefill_question');
    if (prefill) {
      this.question = prefill;
      localStorage.removeItem('nayasetu_home_prefill_question');
    }
    this.loadHistory();
  }

  ngOnDestroy(): void {
    this.stopStream();
    this.stopVoiceInput();
  }

  get user(): any {
    return this.authService.user;
  }

  get isAuthenticated(): boolean {
    return this.authService.isAuthenticated;
  }

  async submit() {
    if (!this.question.trim() || this.loading) return;
    this.stopVoiceInput();

    this.stopStream();
    this.loading = true;
    this.error = '';
    this.explanation = '';
    this.provisions = [];

    try {
      const response = await this.askService.fetchRaw(this.question, this.responseMode);
      this.resolvedResponseMode = response?.meta?.target_lang || this.responseMode;

      if (response.meta && response.meta.type === 'PART_COUNT') {
        this.explanation = `There are ${response.meta.count} articles in the specified Part.`;
        this.loading = false;
        await this.persistCurrentChat();
        await this.loadHistory();
        return;
      }

      this.provisions = response.provisions || [];

      this.currentStream = this.askService.streamExplanation(
        this.question,
        this.provisions,
        token => {
          this.zone.run(() => {
            this.explanation += token;
          });
        },
        async () => {
          this.zone.run(() => {
            this.loading = false;
            this.currentStream = null;
          });
          await this.persistCurrentChat();
          await this.loadHistory();
        },
        () => {
          this.zone.run(() => {
            this.error = 'AI service unavailable.';
            this.loading = false;
            this.currentStream = null;
          });
        },
        this.responseMode
      );
    } catch {
      this.error = 'Server error.';
      this.loading = false;
    }
  }

  cancelGeneration() {
    if (!this.loading) return;
    this.stopStream();
    this.loading = false;
  }

  private initBackendRecorderSupport() {
    const navAny = navigator as any;
    this.backendSttSupported = typeof MediaRecorder !== 'undefined' && !!navAny?.mediaDevices?.getUserMedia;
    this.backendSttPreferred = this.backendSttSupported;
  }

  private initSpeechRecognition() {
    const SpeechRecognitionCtor = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    this.speechSupported = !!SpeechRecognitionCtor;
    if (!this.speechSupported) return;

    this.recognition = new SpeechRecognitionCtor();
    this.recognition.lang = 'en-IN';
    this.recognition.continuous = true;
    this.recognition.interimResults = true;

    this.recognition.onstart = () => {
      this.zone.run(() => {
        this.isListening = true;
        this.speechError = '';
        this.speechBuffer = '';
        this.activeVoiceMode = 'browser';
      });
    };

    this.recognition.onresult = (event: any) => {
      let finalChunk = '';
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        if (result.isFinal) {
          finalChunk += result[0].transcript + ' ';
        }
      }
      if (finalChunk) {
        this.zone.run(() => {
          this.speechBuffer += finalChunk;
        });
      }
    };

    this.recognition.onerror = (event: any) => {
      this.zone.run(() => {
        this.speechError = event?.error ? `Mic error: ${event.error}` : 'Mic error occurred.';
      });
    };

    this.recognition.onend = () => {
      this.zone.run(() => {
        this.isListening = false;
        const transcript = this.speechBuffer.trim();
        if (transcript) {
          this.question = this.question.trim()
            ? `${this.question.trim()} ${transcript}`
            : transcript;
        }
        this.speechBuffer = '';
        if (this.activeVoiceMode === 'browser') {
          this.activeVoiceMode = null;
        }
      });
    };
  }

  toggleVoiceInput() {
    if (this.isTranscribing) return;

    if (this.backendSttPreferred && this.backendSttSupported) {
      if (this.isListening) {
        this.stopBackendRecording();
      } else {
        this.startBackendRecording();
      }
      return;
    }

    if (!this.speechSupported || !this.recognition) return;
    if (this.isListening) {
      this.stopVoiceInput();
      return;
    }
    this.speechError = '';
    this.recognition.start();
  }

  stopVoiceInput() {
    if (this.activeVoiceMode === 'backend' && this.mediaRecorder && this.isListening) {
      this.stopBackendRecording();
      return;
    }
    if (this.activeVoiceMode === 'browser' && this.recognition && this.isListening) {
      this.recognition.stop();
    }
  }

  private async startBackendRecording() {
    try {
      this.speechError = '';
      this.audioChunks = [];
      this.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });

      const mimeOptions = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/mp4'
      ];

      let mimeType = '';
      for (const option of mimeOptions) {
        if ((window as any).MediaRecorder?.isTypeSupported?.(option)) {
          mimeType = option;
          break;
        }
      }

      this.mediaRecorder = mimeType
        ? new MediaRecorder(this.mediaStream, { mimeType })
        : new MediaRecorder(this.mediaStream);

      this.mediaRecorder.ondataavailable = (event: BlobEvent) => {
        if (event.data && event.data.size > 0) {
          this.audioChunks.push(event.data);
        }
      };

      this.mediaRecorder.onstop = () => {
        this.zone.run(() => {
          this.isListening = false;
          if (this.activeVoiceMode === 'backend') {
            this.activeVoiceMode = null;
          }
        });
        this.transcribeRecordedAudio();
      };

      this.mediaRecorder.onerror = () => {
        this.zone.run(() => {
          this.speechError = 'Audio recording failed.';
          this.isListening = false;
          if (this.activeVoiceMode === 'backend') {
            this.activeVoiceMode = null;
          }
        });
        this.cleanupBackendRecorder();
      };

      this.mediaRecorder.start();
      this.isListening = true;
      this.activeVoiceMode = 'backend';
    } catch {
      this.speechError = 'Mic permission denied or unavailable.';
      if (this.speechSupported) {
        this.backendSttPreferred = false;
      }
      this.cleanupBackendRecorder();
    }
  }

  private stopBackendRecording() {
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop();
    } else {
      this.cleanupBackendRecorder();
      this.isListening = false;
      if (this.activeVoiceMode === 'backend') {
        this.activeVoiceMode = null;
      }
    }
  }

  private async transcribeRecordedAudio() {
    try {
      if (!this.audioChunks.length) {
        this.cleanupBackendRecorder();
        return;
      }

      this.isTranscribing = true;
      const mimeType = this.mediaRecorder?.mimeType || 'audio/webm';
      const audioBlob = new Blob(this.audioChunks, { type: mimeType });
      if (audioBlob.size > this.maxAudioBytes) {
        this.speechError = 'Audio is too large. Please keep recording under 10 MB.';
        return;
      }

      const result = await this.askService.transcribeAudio(audioBlob, 'auto');
      const transcript = (result?.transcript || '').trim();

      if (transcript) {
        this.question = this.question.trim()
          ? `${this.question.trim()} ${transcript}`
          : transcript;
      } else if (this.speechSupported) {
        this.backendSttPreferred = false;
        this.speechError = 'No speech detected. Switched to browser voice input.';
      } else {
        this.speechError = 'No speech detected. Please try again.';
      }
    } catch (err: any) {
      const sttMessage = err?.message || 'Backend voice transcription failed.';
      if (this.speechSupported) {
        this.backendSttPreferred = false;
        this.speechError = `${sttMessage} Switched to browser voice input.`;
      } else {
        this.speechError = `${sttMessage} You can type your question.`;
      }
    } finally {
      this.isTranscribing = false;
      this.cleanupBackendRecorder();
    }
  }

  private cleanupBackendRecorder() {
    this.audioChunks = [];
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(track => track.stop());
      this.mediaStream = null;
    }
    this.mediaRecorder = null;
    if (this.activeVoiceMode === 'backend') {
      this.activeVoiceMode = null;
    }
  }

  private stopStream() {
    if (this.currentStream) {
      this.currentStream.close();
      this.currentStream = null;
    }
  }

  async loadHistory() {
    if (!this.isAuthenticated) {
      this.history = [];
      this.historyLoading = false;
      return;
    }
    this.historyLoading = true;
    try {
      this.history = await this.askService.getHistory(40);
    } catch {
      this.history = [];
    } finally {
      this.historyLoading = false;
    }
  }

  selectHistory(item: HistoryItem) {
    this.stopStream();
    this.loading = false;
    this.question = item.question;
    this.provisions = item.provisions || [];
    this.explanation = item.answer || '';
    this.error = '';
  }

  async deleteHistory(item: HistoryItem) {
    if (!this.isAuthenticated) return;
    try {
      await this.askService.deleteHistory(item.history_id);
      this.history = this.history.filter(h => h.history_id !== item.history_id);
      this.activeHistoryMenuId = null;
    } catch {}
  }

  toggleHistoryMenu(historyId: number, e: MouseEvent) {
    e.stopPropagation();
    this.activeHistoryMenuId = this.activeHistoryMenuId === historyId ? null : historyId;
  }

  closeHistoryMenu() {
    this.activeHistoryMenuId = null;
  }

  startNewChat() {
    this.stopStream();
    this.loading = false;
    this.question = '';
    this.provisions = [];
    this.explanation = '';
    this.error = '';
    this.resolvedResponseMode = this.responseMode;
    this.activeHistoryMenuId = null;
  }

  private async persistCurrentChat() {
    if (!this.isAuthenticated) return;
    if (!this.question.trim() || !this.explanation.trim()) return;
    try {
      await this.askService.saveHistory(this.question, this.explanation, this.provisions);
    } catch {}
  }

  getStatuteName(id: number, shortName?: string): string {
    if (shortName) {
      const nameMap: any = {
        IPC: 'Indian Penal Code (IPC)',
        COI: 'Constitution of India',
        BNS: 'Bharatiya Nyaya Sanhita (BNS)',
        BNSS: 'Bharatiya Nagarik Suraksha Sanhita (BNSS)',
        BSA: 'Bharatiya Sakshya Adhiniyam (BSA)',
        CPC: 'Code of Civil Procedure, 1908 (CPC)',
        TPA: 'Transfer of Property Act, 1882 (TPA)'
      };
      if (nameMap[shortName]) return nameMap[shortName];
    }
    const map: any = {
      2: 'Indian Penal Code (IPC)',
      3: 'Constitution of India',
      4: 'Bharatiya Nyaya Sanhita (BNS)',
      5: 'Bharatiya Nagarik Suraksha Sanhita (BNSS)',
      6: 'Bharatiya Sakshya Adhiniyam (BSA)',
      7: 'Code of Civil Procedure, 1908 (CPC)',
      8: 'Transfer of Property Act, 1882 (TPA)'
    };
    return map[id] || 'Unknown Statute';
  }

  getStatuteClass(docId: number, shortName?: string): string {
    const key = (shortName || '').toUpperCase();
    if (key) {
      if (key === 'IPC') return 'ipc';
      if (key === 'COI') return 'constitution';
      if (key === 'BNS') return 'bns';
      if (key === 'BNSS') return 'bnss';
      if (key === 'BSA') return 'bsa';
      if (key === 'CPC') return 'cpc';
      if (key === 'TPA') return 'tpa';
    }
    switch (docId) {
      case 2:
        return 'ipc';
      case 3:
        return 'constitution';
      case 4:
        return 'bns';
      case 5:
        return 'bnss';
      case 6:
        return 'bsa';
      case 7:
        return 'cpc';
      case 8:
        return 'tpa';
      default:
        return '';
    }
  }

  onKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      this.submit();
    }
  }

  exportConversationToPdf() {
    if (!this.hasConversation) {
      this.error = 'Nothing to export yet.';
      return;
    }

    const printWindow = window.open('', '_blank', 'width=980,height=1100');
    if (!printWindow) {
      this.error = 'Popup blocked. Please allow popups to export PDF.';
      return;
    }

    const questionHtml = this.escapeHtml(this.question || 'N/A');
    const modeHtml = this.escapeHtml(this.resolvedResponseMode || this.responseMode);
    const generatedAt = this.escapeHtml(new Date().toLocaleString());
    const logoUrl = this.escapeHtml(`${window.location.origin}/assets/nyayasetu-official.png`);

    const provisionHtml = this.provisions.map(p => {
      const statute = this.escapeHtml(this.getStatuteName(p.meta.document_id, p.meta.document_short_name));
      const title = this.escapeHtml(`${p.meta.type} ${p.meta.number} - ${p.meta.title}`);
      const unit = p.meta.unit_number
        ? `<div class="meta">${this.escapeHtml(`${p.meta.unit_number} - ${p.meta.unit_title || ''}`)}</div>`
        : '';
      const fullText = this.escapeHtml(p.full_text || '');
      return `
        <div class="card">
          <div class="statute">${statute}</div>
          <h3>${title}</h3>
          ${unit}
          <pre>${fullText}</pre>
        </div>
      `;
    }).join('');

    const explanationHtml = this.explanation
      ? `<div class="card ai"><h3>AI Explanation</h3><pre>${this.escapeHtml(this.explanation)}</pre></div>`
      : '';

    const html = `
      <!doctype html>
      <html>
      <head>
        <meta charset="utf-8" />
        <title>NyayaSetu</title>
        <style>
          :root {
            --paper: #ffffff;
            --surface: #fdf3eb;
            --ink: #241d33;
            --muted: #625877;
            --line: rgba(36, 29, 51, 0.2);
            --line-soft: rgba(36, 29, 51, 0.12);
          }
          body {
            font-family: Inter, Segoe UI, Arial, sans-serif;
            background: var(--paper);
            color: var(--ink);
            margin: 0;
          }
          .toolbar {
            position: sticky;
            top: 0;
            z-index: 10;
            background: var(--surface);
            border-bottom: 1px solid var(--line-soft);
            padding: 12px 24px;
            display: flex;
            gap: 10px;
            align-items: center;
          }
          .toolbar button {
            border: 1px solid var(--line);
            border-radius: 8px;
            padding: 8px 12px;
            background: linear-gradient(92deg, #241d33 0%, #3b3153 100%);
            color: #ffffff;
            cursor: pointer;
            font-weight: 600;
          }
          .toolbar .secondary {
            background: #ffffff;
            color: var(--ink);
          }
          .page {
            padding: 20px 24px;
            max-width: 920px;
            margin: 0 auto;
          }
          .export-head {
            display: flex;
            align-items: center;
            gap: 12px;
            margin: 0 0 8px;
          }
          .export-logo {
            width: 52px;
            height: 52px;
            border-radius: 10px;
            object-fit: cover;
            object-position: 50% 18%;
            border: 1px solid var(--line-soft);
            background: var(--surface);
          }
          h1 { margin: 0; color: var(--ink); font-size: 38px; font-family: \"Playfair Display\", Georgia, serif; }
          h3 { margin: 0 0 10px; color: var(--ink); font-size: 22px; font-family: \"Playfair Display\", Georgia, serif; }
          .meta { color: var(--muted); font-size: 12px; margin-bottom: 8px; }
          .card {
            border: 1px solid var(--line);
            border-radius: 12px;
            padding: 14px;
            margin: 0 0 14px;
            background: #fffdfb;
          }
          .card.ai { background: var(--surface); }
          .statute { font-size: 12px; color: #3b3153; margin-bottom: 6px; font-weight: 600; }
          pre { white-space: pre-wrap; word-break: break-word; margin: 0; font-size: 13px; line-height: 1.5; }
          .top { margin-bottom: 16px; }

          @media print {
            .toolbar { display: none; }
            .page { padding: 0; }
            @page { margin: 14mm; }
          }
        </style>
      </head>
      <body>
        <div class="toolbar">
          <button onclick="window.print()">Download PDF</button>
          <button class="secondary" onclick="window.close()">Close</button>
          <span style="font-size:12px;color:#625877;">Click "Download PDF" and choose Save as PDF / Microsoft Print to PDF.</span>
        </div>
        <div class="page">
          <div class="top">
            <div class="export-head">
              <img class="export-logo" src="${logoUrl}" alt="NyayaSetu logo" />
              <h1>NyayaSetu</h1>
            </div>
            <div class="meta">Generated: ${generatedAt}</div>
            <div class="meta">Response mode: ${modeHtml}</div>
          </div>
          <div class="card question">
            <h3>User Question</h3>
            <pre>${questionHtml}</pre>
          </div>
          ${provisionHtml}
          ${explanationHtml}
        </div>
      </body>
      </html>
    `;

    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();
  }

  private escapeHtml(input: string): string {
    return (input || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  get hasConversation(): boolean {
    return this.provisions.length > 0 || !!this.explanation || !!this.error;
  }

  get voiceInputAvailable(): boolean {
    return this.backendSttSupported || this.speechSupported;
  }
}
