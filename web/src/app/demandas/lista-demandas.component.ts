import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import {
  ArrowDown,
  ArrowUp,
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  Hand,
  LucideAngularModule,
  SearchX,
} from 'lucide-angular';
import { EMPTY, Subject, catchError, switchMap, tap } from 'rxjs';
import {
  DemandasService,
  lerConflitoDeReserva,
  type CampoOrdenacao,
  type ConsultaDeDemandas,
  type Demanda,
  type SentidoOrdenacao,
  type StatusDemanda,
} from '../core/demandas.service';
import { mensagemDaApi } from '../core/erros-http';
import { FILAS } from '../core/filas';
import { UsuarioAtual } from '../core/usuario-atual';
import { AvisoComponent, type TipoDeAviso } from '../ui/aviso.component';
import { BotaoComponent } from '../ui/botao.component';
import { EstadoVazioComponent } from '../ui/estado-vazio.component';
import { ModalComponent } from '../ui/modal.component';
import { PilulaStatusComponent } from '../ui/pilula-status.component';
import { SkeletonComponent } from '../ui/skeleton.component';
import { FormEncerramentoComponent } from './form-encerramento.component';

const TAMANHO_DA_PAGINA = 20;

const ROTULOS_DE_STATUS: Record<StatusDemanda, string> = {
  1: 'Aberta',
  2: 'Reservada',
  3: 'Encerrada',
};

@Component({
  selector: 'app-lista-demandas',
  imports: [
    ReactiveFormsModule,
    DatePipe,
    LucideAngularModule,
    AvisoComponent,
    BotaoComponent,
    EstadoVazioComponent,
    ModalComponent,
    PilulaStatusComponent,
    SkeletonComponent,
    FormEncerramentoComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './lista-demandas.component.html',
  styleUrl: './lista-demandas.component.css',
})
export class ListaDemandasComponent {
  private readonly demandasService = inject(DemandasService);
  private readonly usuarioAtual = inject(UsuarioAtual);
  private readonly destroyRef = inject(DestroyRef);

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

  /** Ids com reserva em andamento: o botão dessas linhas fica desabilitado (evita duplo clique). */
  protected readonly reservando = signal<ReadonlySet<number>>(new Set());
  protected readonly aviso = signal<{ id: number; tipo: TipoDeAviso; texto: string } | null>(null);
  private proximoAviso = 0;

  /** Demanda com o formulário de encerramento aberto (só uma por vez). */
  protected readonly encerrandoId = signal<number | null>(null);
  /** O formulário de encerramento está enviando: o modal não pode ser fechado nesse intervalo. */
  protected readonly encerrandoOcupado = signal(false);
  protected readonly demandaEmEncerramento = computed(() => {
    const id = this.encerrandoId();
    return id === null ? null : (this.demandas().find((demanda) => demanda.id === id) ?? null);
  });
  private readonly ehSupervisor = computed(() => this.usuarioAtual.usuario().escopos.includes('demands:supervise'));

  /** Primeira carga: sem linhas ainda, mostra o esqueleto. Nas recargas, as linhas ficam esmaecidas. */
  protected readonly mostrarEsqueleto = computed(() => this.carregando() && this.demandas().length === 0);
  protected readonly recarregando = computed(() => this.carregando() && this.demandas().length > 0);
  protected readonly semResultados = computed(
    () => !this.carregando() && this.erro() === null && this.demandas().length === 0,
  );
  protected readonly totalFormatado = computed(() => this.total().toLocaleString('pt-BR'));
  protected readonly linhasDoEsqueleto = [1, 2, 3, 4, 5, 6, 7, 8];

  protected readonly iconeReservar = Hand;
  protected readonly iconeEncerrar = CheckCheck;
  protected readonly iconeAnterior = ChevronLeft;
  protected readonly iconeProxima = ChevronRight;
  protected readonly iconeSemResultados = SearchX;
  protected readonly iconeCrescente = ArrowUp;
  protected readonly iconeDecrescente = ArrowDown;

  protected readonly totalDePaginas = computed(() => Math.max(1, Math.ceil(this.total() / TAMANHO_DA_PAGINA)));

  private readonly consultas = new Subject<ConsultaDeDemandas>();

  constructor() {
    // switchMap descarta a resposta de uma consulta antiga quando chega uma nova.
    this.consultas
      .pipe(
        tap(() => {
          this.carregando.set(true);
          this.erro.set(null);
          this.aviso.set(null);
          this.encerrandoId.set(null);
        }),
        switchMap((consulta) =>
          this.demandasService.listar(consulta).pipe(
            catchError((falha: unknown) => {
              this.erro.set(mensagemDaApi(falha, 'Não foi possível carregar as demandas. Tente novamente.'));
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
      this.consultas.next(this.montarConsulta());
    });

    // Mudar o filtro volta para a primeira página.
    this.filtros.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => this.pagina.set(1));
  }

  private montarConsulta(): ConsultaDeDemandas {
    const { queue, status } = this.valoresDosFiltros();
    return {
      page: this.pagina(),
      pageSize: TAMANHO_DA_PAGINA,
      queue: queue || undefined,
      status: status === '' || status === undefined ? undefined : status,
      sort: this.ordenarPor(),
      order: this.sentido(),
    };
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

  /** Reservada, e o usuário é o dono ou tem supervisão (a API confere de novo: isto é só experiência de uso). */
  protected podeEncerrar(demanda: Demanda): boolean {
    return demanda.status === 2 && (demanda.workerId === this.usuarioAtual.usuario().id || this.ehSupervisor());
  }

  protected abrirEncerramento(demandaId: number): void {
    this.aviso.set(null);
    this.encerrandoId.set(demandaId);
  }

  protected fecharEncerramento(): void {
    this.encerrandoId.set(null);
  }

  protected aoEncerrar(encerrada: Demanda): void {
    this.substituirLinha(encerrada);
    this.encerrandoId.set(null);
    this.mostrarAviso('sucesso', `Demanda ${encerrada.id} encerrada.`);
  }

  /** A API recusou porque o estado mudou (404/409): recarrega a lista e mostra o motivo. */
  protected aoDesatualizar(mensagem: string): void {
    this.consultas.next(this.montarConsulta());
    this.mostrarAviso('conflito', mensagem);
  }

  protected descartarAviso(): void {
    this.aviso.set(null);
  }

  private mostrarAviso(tipo: TipoDeAviso, texto: string): void {
    this.aviso.set({ id: ++this.proximoAviso, tipo, texto });
  }

  protected estaReservando(demandaId: number): boolean {
    return this.reservando().has(demandaId);
  }

  protected reservar(demanda: Demanda): void {
    // Barreira também no código: o `disabled` do botão já evita, mas não custa garantir.
    if (this.estaReservando(demanda.id)) {
      return;
    }
    this.marcarReservando(demanda.id, true);
    this.aviso.set(null);

    this.demandasService
      .reservar(demanda.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (reservada) => {
          this.substituirLinha(reservada);
          this.mostrarAviso('sucesso', `Demanda ${reservada.id} reservada para você.`);
          this.marcarReservando(demanda.id, false);
        },
        error: (falha: unknown) => {
          // 409: atualiza só esta linha com a demanda atual (quem ficou) e avisa; a lista não é recarregada.
          const conflito = lerConflitoDeReserva(falha);
          if (conflito) {
            this.substituirLinha(conflito.demanda);
            this.mostrarAviso('conflito', conflito.message);
          } else {
            this.mostrarAviso('erro', mensagemDaApi(falha, 'Não foi possível reservar a demanda. Tente novamente.'));
          }
          this.marcarReservando(demanda.id, false);
        },
      });
  }

  private substituirLinha(atualizada: Demanda): void {
    this.demandas.update((lista) => lista.map((item) => (item.id === atualizada.id ? atualizada : item)));
  }

  private marcarReservando(demandaId: number, emAndamento: boolean): void {
    this.reservando.update((atual) => {
      const proximo = new Set(atual);
      if (emAndamento) {
        proximo.add(demandaId);
      } else {
        proximo.delete(demandaId);
      }
      return proximo;
    });
  }
}
