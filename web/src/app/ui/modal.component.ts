import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  inject,
  input,
  output,
  viewChild,
} from '@angular/core';
import { LucideAngularModule, X } from 'lucide-angular';
import { BotaoComponent } from './botao.component';

let proximoId = 0;

/**
 * Modal centralizado sobre o <dialog> nativo: o navegador cuida da camada superior, do fundo
 * inerte, do foco preso e da tecla Esc. Quem usa decide quando ele existe (com @if) e escuta
 * `fechar`. Com `fechavel` falso (operação em andamento), Esc, clique no fundo e o botão X não fecham.
 */
@Component({
  selector: 'app-modal',
  imports: [LucideAngularModule, BotaoComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <dialog
      #dialogo
      class="modal"
      [attr.aria-labelledby]="idDoTitulo"
      (cancel)="aoCancelar($event)"
      (click)="aoClicarNoFundo($event)"
    >
      <div class="painel">
        <header>
          <h2 [id]="idDoTitulo">{{ titulo() }}</h2>
          <button
            type="button"
            app-botao
            variante="fantasma"
            [soIcone]="true"
            [icone]="iconeFechar"
            aria-label="Fechar"
            [disabled]="!fechavel()"
            (click)="pedirParaFechar()"
          ></button>
        </header>
        <div class="corpo"><ng-content /></div>
      </div>
    </dialog>
  `,
  styleUrl: './modal.component.css',
})
export class ModalComponent {
  readonly titulo = input.required<string>();
  readonly fechavel = input(true);
  readonly fechar = output<void>();

  protected readonly iconeFechar = X;
  protected readonly idDoTitulo = `modal-titulo-${++proximoId}`;

  private readonly dialogo = viewChild.required<ElementRef<HTMLDialogElement>>('dialogo');

  constructor() {
    // Fechar o <dialog> ao destruir devolve o foco a quem o abriu (o botão que disparou o modal).
    inject(DestroyRef).onDestroy(() => {
      const elemento = this.dialogo().nativeElement;
      if (elemento.open) {
        elemento.close();
      }
    });

    afterNextRender(() => {
      const elemento = this.dialogo().nativeElement;
      if (!elemento.open) {
        elemento.showModal();
      }
    });
  }

  /** Esc: quem decide é o pai (que remove o modal); aqui só se impede o fechamento nativo. */
  protected aoCancelar(evento: Event): void {
    evento.preventDefault();
    this.pedirParaFechar();
  }

  protected aoClicarNoFundo(evento: MouseEvent): void {
    // Só o clique no próprio <dialog> (fora do painel) conta como "clicar no fundo".
    if (evento.target === this.dialogo().nativeElement) {
      this.pedirParaFechar();
    }
  }

  protected pedirParaFechar(): void {
    if (this.fechavel()) {
      this.fechar.emit();
    }
  }
}
