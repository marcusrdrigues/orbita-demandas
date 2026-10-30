import type { FastifyInstance } from 'fastify';
import type { Pool } from 'mysql2/promise';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type {
  RegistroDeHistorico,
  RepositorioTrace,
} from '../../src/application/portas/repositorio-trace.js';
import { UnidadeDeTrabalhoMysql } from '../../src/infra/mysql/unidade-de-trabalho.js';
import type { Executor } from '../../src/infra/mysql/executor.js';
import {
  cabecalhos,
  construirAppDeTeste,
  criarPoolDeTeste,
  inserirDemanda,
  inserirUsuario,
  lerDemandaCompleta,
  lerTrace,
  limparTabelas,
} from './ambiente.js';

/** Histórico que falha de verdade no MySQL (coluna inexistente), depois de o UPDATE já ter rodado. */
class TraceQueFalhaNoBanco implements RepositorioTrace {
  constructor(private readonly executor: Executor) {}

  async registrar(_registro: RegistroDeHistorico): Promise<void> {
    await this.executor.execute('INSERT INTO demand_trace (coluna_que_nao_existe) VALUES (1)');
  }
}

let pool: Pool;
let appComFalha: FastifyInstance;
let appNormal: FastifyInstance;

beforeAll(() => {
  pool = criarPoolDeTeste(4);
  appComFalha = construirAppDeTeste(pool, {
    unidadeDeTrabalho: new UnidadeDeTrabalhoMysql(pool, (executor) => new TraceQueFalhaNoBanco(executor)),
  });
  appNormal = construirAppDeTeste(pool);
});

afterAll(async () => {
  await appComFalha.close();
  await appNormal.close();
  await limparTabelas(pool);
  await pool.end();
});

beforeEach(async () => {
  await limparTabelas(pool);
  await inserirUsuario(pool, { id: 1, name: 'Ana Lima' });
});

describe('encerramento é atômico com o histórico', () => {
  it('se o INSERT em demand_trace falha, o UPDATE da demanda é desfeito', async () => {
    const id = await inserirDemanda(pool, { status: 2, workerId: 1 });

    const resposta = await appComFalha.inject({
      method: 'POST',
      url: `/demands/${id}/finish`,
      headers: cabecalhos(1),
      payload: { outcome: 'failure', failureReason: 'Sem cobertura', note: 'tentativa' },
    });

    // Falha interna: 500 genérico, sem vazar o erro do banco.
    expect(resposta.statusCode).toBe(500);
    expect(resposta.json()).toEqual({
      code: 'ERRO_INTERNO',
      message: 'Erro interno. Tente novamente mais tarde.',
    });
    expect(resposta.body).not.toMatch(/coluna_que_nao_existe|demand_trace|ER_|SQL/i);

    // O encerramento foi desfeito: a demanda continua reservada, sem resultado, motivo nem observação.
    expect(await lerDemandaCompleta(pool, id)).toMatchObject({
      status: 2,
      worker_id: 1,
      outcome: null,
      failure_reason: null,
      note: null,
    });
    expect(await lerTrace(pool, id)).toHaveLength(0);
  });

  it('a falha não deixa a conexão presa nem trava a linha: o encerramento seguinte funciona', async () => {
    const id = await inserirDemanda(pool, { status: 2, workerId: 1 });
    // Mais falhas que conexões no pool (4): se alguma ficasse presa, estas chamadas travariam.
    for (let i = 0; i < 6; i++) {
      const falha = await appComFalha.inject({
        method: 'POST',
        url: `/demands/${id}/finish`,
        headers: cabecalhos(1),
        payload: { outcome: 'success' },
      });
      expect(falha.statusCode).toBe(500);
    }

    const ok = await appNormal.inject({
      method: 'POST',
      url: `/demands/${id}/finish`,
      headers: cabecalhos(1),
      payload: { outcome: 'success' },
    });

    expect(ok.statusCode).toBe(200);
    expect(await lerDemandaCompleta(pool, id)).toMatchObject({ status: 3, outcome: 'success' });
    expect(await lerTrace(pool, id)).toHaveLength(1);
  });
});
