import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, input, output, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import {
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators,
  type AbstractControl,
  type ValidationErrors,
} from '@angular/forms';
import { map } from 'rxjs';
import {
  DemandasService,
  type CorpoDeEncerramento,
  type Demanda,
  type Resultado,
} from '../core/demandas.service';
import { mensagemDaApi } from '../core/erros-http';

const LIMITE_DO_MOTIVO = 40;
const LIMITE_DA_OBSERVACAO = 500;

/** Motivo só com espaços não vale (a API também apara e recusa). */
function naoSoEspacos(controle: AbstractControl<string>): ValidationErrors | null {
  return controle.value.trim() === '' ? { espacos: true } : null;
}

const VALIDADORES_DO_MOTIVO = [Validators.required, naoSoEspacos, Validators.maxLength(LIMITE_DO_MOTIVO)];

@Component({
  selector: 'app-form-encerramento',
  imports: [ReactiveFormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './form-encerramento.component.html',
  styleUrl: './form-encerramento.component.css',
})
export class FormEncerramentoComponent {
  private readonly demandasService = inject(DemandasService);
  private readonly destroyRef = inject(DestroyRef);

  readonly demanda = input.required<Demanda>();

  /** A demanda foi encerrada; leva a demanda atualizada. */
  readonly encerrada = output<Demanda>();
  /** A API recusou porque o estado mudou (404 ou 409); leva a mensagem para a lista recarregar. */
  readonly desatualizada = output<string>();
  readonly cancelada = output<void>();

  protected readonly limiteDoMotivo = LIMITE_DO_MOTIVO;
  protected readonly limiteDaObservacao = LIMITE_DA_OBSERVACAO;

  // updateOn 'change': valida a cada tecla digitada, não só ao sair do campo.
  protected readonly form = new FormGroup(
    {
      outcome: new FormControl<Resultado | null>(null, { validators: [Validators.required], updateOn: 'change' }),
      failureReason: new FormControl('', { nonNullable: true, updateOn: 'change' }),
      note: new FormControl('', {
        nonNullable: true,
        validators: [Validators.maxLength(LIMITE_DA_OBSERVACAO)],
        updateOn: 'change',
      }),
    },
    { updateOn: 'change' },
  );

  protected readonly resultado = toSignal(this.form.controls.outcome.valueChanges, { initialValue: null });
  protected readonly valido = toSignal(this.form.statusChanges.pipe(map((estado) => estado === 'VALID')), {
    initialValue: this.form.valid,
  });
  private readonly textoDoMotivo = toSignal(this.form.controls.failureReason.valueChanges, { initialValue: '' });
  private readonly textoDaObservacao = toSignal(this.form.controls.note.valueChanges, { initialValue: '' });

  protected readonly tamanhoDoMotivo = computed(() => this.textoDoMotivo().length);
  protected readonly tamanhoDaObservacao = computed(() => this.textoDaObservacao().length);

  protected readonly enviando = signal(false);
  protected readonly erro = signal<string | null>(null);

  constructor() {
    this.form.controls.outcome.valueChanges.pipe(takeUntilDestroyed()).subscribe((resultado) => {
      this.ajustarMotivo(resultado);
    });
  }

  protected get motivo(): FormControl<string> {
    return this.form.controls.failureReason;
  }

  protected get observacao(): FormControl<string> {
    return this.form.controls.note;
  }

  protected idDoCampo(nome: string): string {
    return `${nome}-${this.demanda().id}`;
  }

  /** Mostra o erro do campo assim que o usuário mexeu nele (digitou ou saiu do campo). */
  protected mostrarErro(controle: AbstractControl): boolean {
    return controle.invalid && (controle.dirty || controle.touched);
  }

  protected mensagemDoMotivo(): string {
    return this.motivo.hasError('maxlength')
      ? `O motivo pode ter no máximo ${LIMITE_DO_MOTIVO} caracteres.`
      : 'Informe o motivo do insucesso.';
  }

  protected concluir(): void {
    if (this.form.invalid || this.enviando()) {
      return;
    }
    const { outcome, failureReason, note } = this.form.getRawValue();
    if (outcome === null) {
      return;
    }

    const corpo: CorpoDeEncerramento = {
      outcome,
      ...(outcome === 'failure' ? { failureReason: failureReason.trim() } : {}),
      ...(note.trim() !== '' ? { note: note.trim() } : {}),
    };

    this.enviando.set(true);
    this.erro.set(null);
    this.demandasService
      .encerrar(this.demanda().id, corpo)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (encerrada) => {
          this.enviando.set(false);
          this.encerrada.emit(encerrada);
        },
        error: (falha: unknown) => {
          this.enviando.set(false);
          const mensagem = mensagemDaApi(falha);
          if (falha instanceof HttpErrorResponse && (falha.status === 404 || falha.status === 409)) {
            this.desatualizada.emit(mensagem);
          } else {
            this.erro.set(mensagem);
          }
        },
      });
  }

  /** O motivo só existe (e só é obrigatório) no insucesso; ao voltar para sucesso, é limpo. */
  private ajustarMotivo(resultado: Resultado | null): void {
    const motivo = this.form.controls.failureReason;
    if (resultado === 'failure') {
      motivo.setValidators(VALIDADORES_DO_MOTIVO);
      // O campo acabou de aparecer: só mostra erro depois que o usuário interagir com ele.
      motivo.markAsPristine();
      motivo.markAsUntouched();
    } else {
      motivo.clearValidators();
      motivo.reset('');
    }
    motivo.updateValueAndValidity();
  }
}
