import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { EMPTY, Subject, catchError, switchMap, tap } from 'rxjs';
import {
  DemandasService,
  type CampoOrdenacao,
  type ConsultaDeDemandas,
  type Demanda,
  type SentidoOrdenacao,
  type StatusDemanda,
} from '../core/demandas.service';
import { FILAS } from '../core/filas';
import { UsuarioAtual } from '../core/usuario-atual';

const TAMANHO_DA_PAGINA = 20;

const ROTULOS_DE_STATUS: Record<StatusDemanda, string> = {
  1: 'Aberta',
  2: 'Reservada',
  3: 'Encerrada',
};

@Component({
  selector: 'app-lista-demandas',
  imports: [ReactiveFormsModule, DatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './lista-demandas.component.html',
  styleUrl: './lista-demandas.component.css',
})
export class ListaDemandasComponent {
  private readonly demandasService = inject(DemandasService);
  private readonly usuarioAtual = inject(UsuarioAtual);

  protected readonly filas = FILAS;
  protected readonly statusDisponiveis: readonly StatusDemanda[] = [1, 2, 3];

  protected readonly filtros = new FormGroup({
    queue: new FormControl('', { nonNullable: true }),
    status: new FormControl<StatusDemanda | ''>('', { nonNullable: true }),
  });

  private readonly valoresDosFiltros = toSignal(this.filtros.valueChanges, {
    initialValue: this.filtros.getRawValue(),
  });

  protected readonly pagina = signal(1);
  protected readonly ordenarPor = signal<CampoOrdenacao>('id');
  protected readonly sentido = signal<SentidoOrdenacao>('asc');

  protected readonly demandas = signal<Demanda[]>([]);
  protected readonly total = signal(0);
  protected readonly carregando = signal(false);
  protected readonly erro = signal<string | null>(null);

  protected readonly totalDePaginas = computed(() => Math.max(1, Math.ceil(this.total() / TAMANHO_DA_PAGINA)));

  private readonly consultas = new Subject<ConsultaDeDemandas>();

  constructor() {
    // switchMap descarta a resposta de uma consulta antiga quando chega uma nova.
    this.consultas
      .pipe(
        tap(() => {
          this.carregando.set(true);
          this.erro.set(null);
        }),
        switchMap((consulta) =>
          this.demandasService.listar(consulta).pipe(
            catchError((falha: unknown) => {
              this.erro.set(this.mensagemDeErro(falha));
              this.carregando.set(false);
              return EMPTY;
            }),
          ),
        ),
        takeUntilDestroyed(),
      )
      .subscribe((resposta) => {
        this.demandas.set(resposta.items);
        this.total.set(resposta.total);
        this.carregando.set(false);
      });

    // Refaz a consulta quando muda filtro, ordenação, página ou o usuário simulado.
    effect(() => {
      this.usuarioAtual.usuario();
      const { queue, status } = this.valoresDosFiltros();
      this.consultas.next({
        page: this.pagina(),
        pageSize: TAMANHO_DA_PAGINA,
        queue: queue || undefined,
        status: status === '' || status === undefined ? undefined : status,
        sort: this.ordenarPor(),
        order: this.sentido(),
      });
    });

    // Mudar o filtro volta para a primeira página.
    this.filtros.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => this.pagina.set(1));
  }

  protected rotuloDoStatus(status: StatusDemanda): string {
    return ROTULOS_DE_STATUS[status];
  }

  protected ordenar(campo: CampoOrdenacao): void {
    if (this.ordenarPor() === campo) {
      this.sentido.update((atual) => (atual === 'asc' ? 'desc' : 'asc'));
    } else {
      this.ordenarPor.set(campo);
      this.sentido.set('asc');
    }
    this.pagina.set(1);
  }

  protected ariaSort(campo: CampoOrdenacao): 'ascending' | 'descending' | 'none' {
    if (this.ordenarPor() !== campo) return 'none';
    return this.sentido() === 'asc' ? 'ascending' : 'descending';
  }

  protected irParaPagina(numero: number): void {
    this.pagina.set(Math.min(Math.max(1, numero), this.totalDePaginas()));
  }

  private mensagemDeErro(falha: unknown): string {
    if (falha instanceof HttpErrorResponse) {
      const mensagem = (falha.error as { message?: unknown } | null)?.message;
      if (typeof mensagem === 'string' && mensagem !== '') {
        return mensagem;
      }
      if (falha.status === 0) {
        return 'Não foi possível falar com o servidor. Confira se a API está no ar.';
      }
    }
    return 'Não foi possível carregar as demandas. Tente novamente.';
  }
}
