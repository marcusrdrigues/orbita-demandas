import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { LucideAngularModule, type LucideIconData } from 'lucide-angular';

/** Estado vazio: ícone, título e uma linha de ajuda. O conteúdo projetado entra como ação. */
@Component({
  selector: 'app-estado-vazio',
  imports: [LucideAngularModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span class="icone"><lucide-icon [img]="icone()" [size]="28" aria-hidden="true" /></span>
    <h3>{{ titulo() }}</h3>
    @if (descricao()) {
      <p>{{ descricao() }}</p>
    }
    <ng-content />
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: var(--space-2);
      padding: var(--space-12) var(--space-6);
      text-align: center;
    }

    .icone {
      display: grid;
      place-items: center;
      width: 56px;
      height: 56px;
      margin-bottom: var(--space-2);
      border-radius: var(--radius-full);
      background: var(--accent-soft);
      color: var(--accent-soft-fg);
    }

    h3 {
      margin: 0;
      font-size: var(--text-lg);
    }

    p {
      max-width: 36ch;
      color: var(--text-muted);
      font-size: var(--text-sm);
    }
  `,
})
export class EstadoVazioComponent {
  readonly icone = input.required<LucideIconData>();
  readonly titulo = input.required<string>();
  readonly descricao = input('');
}
