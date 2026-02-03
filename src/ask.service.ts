import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class AskService {

  async fetchArticles(question: string): Promise<any> {
    const res = await fetch(
      `http://localhost:5000/api/article?question=${encodeURIComponent(question)}`
    );
    return res.json();
  }

  streamExplanation(
    question: string,
    articles: any[],
    onToken: (t: string) => void,
    onComplete: () => void
  ) {
    const es = new EventSource(
      `http://localhost:5000/api/explain/stream` +
      `?question=${encodeURIComponent(question)}` +
      `&articles=${encodeURIComponent(JSON.stringify(articles))}`
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
      onComplete();
    };
  }
}
