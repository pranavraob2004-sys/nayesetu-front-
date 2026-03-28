import { AfterViewInit, Component, ElementRef, OnDestroy, OnInit, QueryList, ViewChildren } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

@Component({
  selector: 'app-home',
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.css']
})
export class HomeComponent implements OnInit, AfterViewInit, OnDestroy {
  homeQuestion = '';
  animatedPlaceholder = 'Ask about Article 21...';
  private placeholderIndex = 0;
  private placeholderTimerId: number | null = null;
  private revealObserver: IntersectionObserver | null = null;

  @ViewChildren('revealEl') revealEls!: QueryList<ElementRef<HTMLElement>>;
  readonly placeholderPool = [
    'Ask about Article 21...',
    'Ask about BNS Section 302...',
    'Ask about bail law...',
    'What does Article 19 guarantee?'
  ];

  constructor(
    private authService: AuthService,
    private router: Router
  ) {}

  ngOnInit() {
    this.startPlaceholderLoop();
  }

  ngAfterViewInit() {
    this.initRevealObserver();
  }

  ngOnDestroy() {
    if (this.placeholderTimerId) {
      window.clearInterval(this.placeholderTimerId);
      this.placeholderTimerId = null;
    }
    if (this.revealObserver) {
      this.revealObserver.disconnect();
      this.revealObserver = null;
    }
  }

  private startPlaceholderLoop() {
    this.placeholderTimerId = window.setInterval(() => {
      this.placeholderIndex = (this.placeholderIndex + 1) % this.placeholderPool.length;
      this.animatedPlaceholder = this.placeholderPool[this.placeholderIndex];
    }, 2400);
  }

  private initRevealObserver() {
    this.revealObserver = new IntersectionObserver(
      entries => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add('in-view');
          }
        }
      },
      { threshold: 0.16 }
    );

    this.revealEls.forEach(el => this.revealObserver?.observe(el.nativeElement));
  }

  openAskFlow() {
    const text = this.homeQuestion.trim();
    if (text) {
      localStorage.setItem('nayasetu_home_prefill_question', text);
    }
    this.router.navigateByUrl('/workspace');
  }

  exploreLaws() {
    this.router.navigateByUrl(this.authService.isAuthenticated ? '/workspace' : '/signup');
  }

  useExample(question: string) {
    this.homeQuestion = question;
  }

  askFromTemplate(question: string) {
    this.homeQuestion = question;
    this.openAskFlow();
  }
}
