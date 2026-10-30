import { describe, expect, it } from 'vitest';
import { EncerrarDemanda } from '../../src/application/casos-de-uso/encerrar-demanda.js';
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
import {
  DemandaNaoEncontrada,
  DemandaNaoReservada,
  EncerramentoInvalido,
  SemPermissao,
} from '../../src/domain/erros.js';
import type { Operador } from '../../src/domain/usuario.js';

function demanda(parcial: Partial<Demanda> = {}): Demanda {
  return {
    id: 10,
    title: 'Demanda de teste',
    queue: 'suporte',
    status: StatusDemanda.Reservada,
    workerId: 1,
    workerName: 'Ana Lima',
    outcome: null,
    failureReason: null,
    note: null,
    updatedAt: new Date('2026-10-01T10:00:00Z'),
    ...parcial,
  };
}

class RepositorioDemandasFalso implements RepositorioDemandas {
  encerramentos: Array<{ id: number; dados: DadosDeEncerramento }> = [];

  constructor(private readonly porId: Map<number, Demanda>) {}

  async buscarParaAtualizar(id: number): Promise<Demanda | null> {
    const encontrada = this.porId.get(id);
    return encontrada ? { ...encontrada } : null;
  }

  async buscarPorId(id: number): Promise<Demanda | null> {
    return this.buscarParaAtualizar(id);
  }

  async encerrar(id: number, dados: DadosDeEncerramento): Promise<void> {
    this.encerramentos.push({ id, dados });
    const atual = this.porId.get(id)!;
    this.porId.set(id, {
      ...atual,
      status: StatusDemanda.Encerrada,
      outcome: dados.outcome,
      failureReason: dados.failureReason,
      note: dados.note,
    });
  }

  listar(_filtro: FiltroListagem): Promise<PaginaDeDemandas> {
    throw new Error('não usado neste teste');
  }
  reservarSeAberta(_demandaId: number, _usuarioId: number): Promise<boolean> {
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
  return { casoDeUso: new EncerrarDemanda(repositorio, unidadeDeTrabalho), repositorio, trace };
}

const operador = (id: number, escopos: string[] = ['demands']): Operador => ({
  id,
  name: `Usuário ${id}`,
  escopos: new Set(escopos),
});

const dona = operador(1);
const outro = operador(2);
const supervisora = operador(3, ['demands', 'demands:supervise']);

describe('EncerrarDemanda (repositório falso)', () => {
  it('o dono encerra: grava o encerramento e um registro de histórico', async () => {
    const { casoDeUso, repositorio, trace } = montar([demanda()]);

    const resultado = await casoDeUso.executar(10, dona, { outcome: 'success', note: 'ok' });

    expect(resultado).toMatchObject({ status: StatusDemanda.Encerrada, outcome: 'success' });
    expect(repositorio.encerramentos).toEqual([
      { id: 10, dados: { outcome: 'success', failureReason: null, note: 'ok' } },
    ]);
    expect(trace.registros).toEqual([{ demandaId: 10, usuarioId: 1, acao: 'encerrada', observacao: 'ok' }]);
  });

  it('a supervisora encerra demanda de outra pessoa e o histórico guarda quem encerrou', async () => {
    const { casoDeUso, trace } = montar([demanda()]);

    await casoDeUso.executar(10, supervisora, { outcome: 'success' });

    expect(trace.registros[0]).toMatchObject({ usuarioId: 3, acao: 'encerrada' });
  });

  it('404 vem primeiro: inexistente, mesmo para quem não seria dono', async () => {
    const { casoDeUso, trace } = montar([]);

    await expect(casoDeUso.executar(10, outro, { outcome: 'success' })).rejects.toBeInstanceOf(
      DemandaNaoEncontrada,
    );
    expect(trace.registros).toHaveLength(0);
  });

  it.each([
    ['aberta', demanda({ status: StatusDemanda.Aberta, workerId: null, workerName: null })],
    ['encerrada', demanda({ status: StatusDemanda.Encerrada, outcome: 'success' })],
  ])('409 vem antes do 403: demanda %s, mesmo para quem não é o dono', async (_nome, estado) => {
    const { casoDeUso, repositorio, trace } = montar([estado]);

    await expect(casoDeUso.executar(10, outro, { outcome: 'success' })).rejects.toBeInstanceOf(
      DemandaNaoReservada,
    );
    expect(repositorio.encerramentos).toHaveLength(0);
    expect(trace.registros).toHaveLength(0);
  });

  it('403: reservada por outro e sem supervisão; nada é gravado', async () => {
    const { casoDeUso, repositorio, trace } = montar([demanda()]);

    await expect(casoDeUso.executar(10, outro, { outcome: 'success' })).rejects.toBeInstanceOf(SemPermissao);
    expect(repositorio.encerramentos).toHaveLength(0);
    expect(trace.registros).toHaveLength(0);
  });

  it('insucesso sem motivo é recusado antes de tocar no repositório', async () => {
    const { casoDeUso, repositorio } = montar([demanda()]);

    await expect(casoDeUso.executar(10, dona, { outcome: 'failure' })).rejects.toBeInstanceOf(
      EncerramentoInvalido,
    );
    expect(repositorio.encerramentos).toHaveLength(0);
  });

  it('sucesso com motivo é recusado', async () => {
    const { casoDeUso } = montar([demanda()]);

    await expect(
      casoDeUso.executar(10, dona, { outcome: 'success', failureReason: 'Sem cobertura' }),
    ).rejects.toBeInstanceOf(EncerramentoInvalido);
  });

  it('observação vazia ou só com espaços vira nula; motivo é aparado', async () => {
    const { casoDeUso, repositorio } = montar([demanda()]);

    await casoDeUso.executar(10, dona, { outcome: 'failure', failureReason: '  Sem cobertura ', note: '   ' });

    expect(repositorio.encerramentos[0]?.dados).toEqual({
      outcome: 'failure',
      failureReason: 'Sem cobertura',
      note: null,
    });
  });
});
