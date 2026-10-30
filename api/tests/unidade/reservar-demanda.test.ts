import { describe, expect, it } from 'vitest';
import { ReservarDemanda } from '../../src/application/casos-de-uso/reservar-demanda.js';
import type {
  DadosDeEncerramento,
  FiltroListagem,
  PaginaDeDemandas,
  RepositorioDemandas,
} from '../../src/application/portas/repositorio-demandas.js';
import type {
  RegistroDeHistorico,
  RepositorioTrace,
} from '../../src/application/portas/repositorio-trace.js';
import type { UnidadeDeTrabalho } from '../../src/application/portas/unidade-de-trabalho.js';
import { StatusDemanda, type Demanda } from '../../src/domain/demanda.js';
import { DemandaEncerrada, DemandaJaReservada, DemandaNaoEncontrada } from '../../src/domain/erros.js';

const USUARIOS: Record<number, string> = { 1: 'Ana Lima', 2: 'Bruno Costa' };

function demandaAberta(id: number): Demanda {
  return {
    id,
    title: 'Demanda de teste',
    queue: 'suporte',
    status: StatusDemanda.Aberta,
    workerId: null,
    workerName: null,
    outcome: null,
    failureReason: null,
    note: null,
    updatedAt: new Date('2026-10-01T10:00:00Z'),
  };
}

/** Repositório falso que se comporta como o UPDATE condicional: só o primeiro a chegar reserva. */
class RepositorioDemandasFalso implements RepositorioDemandas {
  constructor(private readonly porId: Map<number, Demanda>) {}

  async reservarSeAberta(demandaId: number, usuarioId: number): Promise<boolean> {
    const demanda = this.porId.get(demandaId);
    if (!demanda || demanda.status !== StatusDemanda.Aberta) return false;
    demanda.status = StatusDemanda.Reservada;
    demanda.workerId = usuarioId;
    demanda.workerName = USUARIOS[usuarioId] ?? null;
    return true;
  }

  async buscarPorId(demandaId: number): Promise<Demanda | null> {
    const demanda = this.porId.get(demandaId);
    return demanda ? { ...demanda } : null;
  }

  listar(_filtro: FiltroListagem): Promise<PaginaDeDemandas> {
    throw new Error('não usado neste teste');
  }
  buscarParaAtualizar(_demandaId: number): Promise<Demanda | null> {
    throw new Error('não usado neste teste');
  }
  encerrar(_demandaId: number, _dados: DadosDeEncerramento): Promise<void> {
    throw new Error('não usado neste teste');
  }
}

class TraceEspiao implements RepositorioTrace {
  readonly registros: RegistroDeHistorico[] = [];

  async registrar(registro: RegistroDeHistorico): Promise<void> {
    this.registros.push(registro);
  }
}

function montar(demandas: Demanda[]) {
  const repositorio = new RepositorioDemandasFalso(new Map(demandas.map((d) => [d.id, d])));
  const trace = new TraceEspiao();
  const unidadeDeTrabalho: UnidadeDeTrabalho = {
    executar: (trabalho) => trabalho({ demandas: repositorio, trace }),
  };
  return { casoDeUso: new ReservarDemanda(repositorio, unidadeDeTrabalho), trace };
}

const ana = { id: 1, name: 'Ana Lima' };
const bruno = { id: 2, name: 'Bruno Costa' };

describe('ReservarDemanda (repositório falso)', () => {
  it('quem reserva uma demanda aberta grava um registro de histórico', async () => {
    const { casoDeUso, trace } = montar([demandaAberta(10)]);

    const demanda = await casoDeUso.executar(10, ana);

    expect(demanda).toMatchObject({ status: StatusDemanda.Reservada, workerId: 1, workerName: 'Ana Lima' });
    expect(trace.registros).toEqual([{ demandaId: 10, usuarioId: 1, acao: 'reservada', observacao: null }]);
  });

  it('ao perder a corrida, nada é gravado no histórico e o erro informa quem ficou', async () => {
    const { casoDeUso, trace } = montar([demandaAberta(10)]);

    const resultados = await Promise.allSettled([casoDeUso.executar(10, ana), casoDeUso.executar(10, bruno)]);

    const venceu = resultados.filter((r) => r.status === 'fulfilled');
    const perdeu = resultados.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
    expect(venceu).toHaveLength(1);
    expect(perdeu).toHaveLength(1);

    const erro = perdeu[0]!.reason;
    expect(erro).toBeInstanceOf(DemandaJaReservada);
    expect((erro as DemandaJaReservada).dono).toEqual({ id: 1, name: 'Ana Lima' });
    expect((erro as DemandaJaReservada).message).toBe('Demanda já reservada por Ana Lima.');

    // Só o vencedor deixou rastro: o perdedor não gravou nada.
    expect(trace.registros).toHaveLength(1);
    expect(trace.registros[0]).toMatchObject({ usuarioId: 1, acao: 'reservada' });
  });

  it('o mesmo usuário reservando de novo tem sucesso e não grava outro registro', async () => {
    const { casoDeUso, trace } = montar([demandaAberta(10)]);
    await casoDeUso.executar(10, ana);

    const demanda = await casoDeUso.executar(10, ana);

    expect(demanda).toMatchObject({ status: StatusDemanda.Reservada, workerId: 1 });
    expect(trace.registros).toHaveLength(1);
  });

  it('demanda encerrada → DemandaEncerrada, sem histórico', async () => {
    const encerrada: Demanda = { ...demandaAberta(10), status: StatusDemanda.Encerrada, workerId: 1, outcome: 'success' };
    const { casoDeUso, trace } = montar([encerrada]);

    await expect(casoDeUso.executar(10, bruno)).rejects.toBeInstanceOf(DemandaEncerrada);
    expect(trace.registros).toHaveLength(0);
  });

  it('demanda inexistente → DemandaNaoEncontrada, sem histórico', async () => {
    const { casoDeUso, trace } = montar([]);

    await expect(casoDeUso.executar(10, ana)).rejects.toBeInstanceOf(DemandaNaoEncontrada);
    expect(trace.registros).toHaveLength(0);
  });
});
