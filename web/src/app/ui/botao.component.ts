import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { LoaderCircle, LucideAngularModule, type LucideIconData } from 'lucide-angular';

export type VarianteDoBotao = 'primario' | 'secundario' | 'fantasma';

/**
 * Estilo e ícone para o <button> nativo. Usa seletor de atributo para manter a semântica do
 * elemento: `type`, `disabled`, `(click)` e `aria-*` continuam sendo do próprio botão.
 * Botão só com ícone precisa de `aria-label` (e `soIcone`).
 */
@Component({
  selector: 'button[app-botao]',
  imports: [LucideAngularModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'botao',
    '[class.botao-primario]': "variante() === 'primario'",
    '[class.botao-secundario]': "variante() === 'secundario'",
    '[class.botao-fantasma]': "variante() === 'fantasma'",
    '[class.botao-pequeno]': "tamanho() === 'pequeno'",
    '[class.so-icone]': 'soIcone()',
    '[attr.aria-busy]': 'carregando() ? true : null',
  },
  template: `
    @if (carregando()) {
      <lucide-icon [img]="girando" [size]="16" class="girando" aria-hidden="true" />
    } @else if (icone(); as dados) {
      @if (!iconeAoFinal()) {
        <lucide-icon [img]="dados" [size]="16" aria-hidden="true" />
      }
    }
    <ng-content />
    @if (iconeAoFinal() && !carregando() && icone(); as dados) {
      <lucide-icon [img]="dados" [size]="16" aria-hidden="true" />
    }
  `,
  styleUrl: './botao.component.css',
})
export class BotaoComponent {
  readonly variante = input<VarianteDoBotao>('secundario');
  readonly tamanho = input<'medio' | 'pequeno'>('medio');
  readonly icone = input<LucideIconData | null>(null);
  readonly soIcone = input(false);
  /** Põe o ícone depois do texto (por exemplo, a seta de "Próxima"). */
  readonly iconeAoFinal = input(false);
  readonly carregando = input(false);

  protected readonly girando = LoaderCircle;
}
