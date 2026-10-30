import { ChangeDetectionStrategy, Component, computed, effect, input, output, signal } from '@angular/core';
import {
  CircleAlert,
  CircleCheck,
  Info,
  LucideAngularModule,
  TriangleAlert,
  X,
  type LucideIconData,
} from 'lucide-angular';
import { BotaoComponent } from './botao.component';

export type TipoDeAviso = 'sucesso' | 'conflito' | 'erro' | 'info';

const ICONES: Record<TipoDeAviso, LucideIconData> = {
  sucesso: CircleCheck,
  conflito: TriangleAlert,
  erro: CircleAlert,
  info: Info,
};

/**
 * Aviso curto. Some sozinho depois de `duracaoMs` (0 = não some). O prazo pausa enquanto o
 * mouse está sobre o aviso ou o foco está dentro dele, e o botão de fechar sempre existe.
 * Conflito e erro são anunciados de imediato (role="alert"); os demais, com educação (role="status").
 */
@Component({
  selector: 'app-aviso',
  imports: [LucideAngularModule, BotaoComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class]': "'aviso aviso-' + tipo()",
    '[attr.role]': "tipo() === 'conflito' || tipo() === 'erro' ? 'alert' : 'status'",
    '(mouseenter)': 'pausado.set(true)',
    '(mouseleave)': 'pausado.set(false)',
    '(focusin)': 'pausado.set(true)',
    '(focusout)': 'pausado.set(false)',
  },
  template: `
    <lucide-icon [img]="icone()" [size]="20" aria-hidden="true" />
    <p class="texto">{{ texto() }}</p>
    @if (fechavel()) {
      <button
        type="button"
        app-botao
        variante="fantasma"
        tamanho="pequeno"
        [soIcone]="true"
        [icone]="fechar"
        aria-label="Fechar aviso"
        (click)="fechado.emit()"
      ></button>
    }
  `,
  styleUrl: './aviso.component.css',
})
export class AvisoComponent {
  readonly tipo = input<TipoDeAviso>('info');
  readonly texto = input.required<string>();
  /** Muda a cada aviso novo, para reiniciar o prazo mesmo quando o texto se repete. */
  readonly chave = input(0);
  readonly duracaoMs = input(6000);
  readonly fechavel = input(true);

  readonly fechado = output<void>();

  protected readonly pausado = signal(false);
  protected readonly icone = computed(() => ICONES[this.tipo()]);
  protected readonly fechar = X;

  constructor() {
    effect((limpar) => {
      this.chave();
      this.texto();
      const duracao = this.duracaoMs();
      if (duracao <= 0 || this.pausado()) {
        return;
      }
      const prazo = setTimeout(() => this.fechado.emit(), duracao);
      limpar(() => clearTimeout(prazo));
    });
  }
}
