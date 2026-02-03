import { Component, NgZone } from '@angular/core';
import { AskService } from 'src/ask.service';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css']
})
export class AppComponent {

  question = '';
  loading = false;

  articleBlock = '';
  fullTextBlock = '';
  explanation = '';

  // raw buffers for typewriter
  public rawArticleText = '';
  public rawFullText = '';

  constructor(
    private askService: AskService,
    private zone: NgZone
  ) {}

  async submit() {
    if (!this.question.trim() || this.loading) return;

    this.loading = true;
    this.articleBlock = '';
    this.fullTextBlock = '';
    this.explanation = '';
    this.rawArticleText = '';
    this.rawFullText = '';

    // 1️⃣ FETCH ARTICLE + FULL TEXT (DB)
    const data = await this.askService.fetchArticles(this.question);
    const articles = data.articles || [];

    // Build RAW text (no animation here)
    for (const a of articles) {
      this.rawArticleText +=
        `Article ${a.article.number}\n` +
        `${a.article.title}\n` +
        `${a.article.part}\n` +
        `Status: ${a.article.status}\n\n`;

      this.rawFullText += a.full_text + '\n\n';
    }

    // 2️⃣ TYPEWRITER EFFECT (NOT STREAMING)
    this.typewriter(this.rawArticleText, 'article', 10);
    this.typewriter(this.rawFullText, 'fullText', 5);

    // 3️⃣ STREAM EXPLANATION (LLM)
    this.askService.streamExplanation(
      this.question,
      articles,
      token => {
        this.zone.run(() => {
          this.explanation += token;
        });
      },
      () => {
        this.zone.run(() => {
          this.loading = false;
        });
      }
    );
  }

  private typewriter(
    source: string,
    target: 'article' | 'fullText',
    speed = 12
  ) {
    let i = 0;
    const interval = setInterval(() => {
      if (i >= source.length) {
        clearInterval(interval);
        return;
      }

      if (target === 'article') {
        this.articleBlock += source[i];
      } else {
        this.fullTextBlock += source[i];
      }

      i++;
    }, speed);
  }

  onKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      this.submit();
    }
  }
}
