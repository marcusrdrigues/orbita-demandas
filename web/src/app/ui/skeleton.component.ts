import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** Bloco cinza animado que ocupa o lugar do conteúdo que ainda está carregando. */
@Component({
  selector: 'app-skeleton',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { 'aria-hidden': 'true', '[style.width]': 'largura()' },
  template: '',
  styles: `
    :host {
      display: block;
      max-width: 100%;
      height: 1em;
      border-radius: var(--radius-sm);
      background: linear-gradient(90deg, var(--skeleton-a) 25%, var(--skeleton-b) 50%, var(--skeleton-a) 75%);
      background-size: 200% 100%;
      animation: brilho 1.4s linear infinite;
    }

    @keyframes brilho {
      from {
        background-position: 200% 0;
      }
      to {
        background-position: -200% 0;
      }
    }
  `,
})
export class SkeletonComponent {
  readonly largura = input('100%');
}
