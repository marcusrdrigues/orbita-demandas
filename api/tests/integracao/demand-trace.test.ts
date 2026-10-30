import type { FastifyInstance } from 'fastify';
import type { Pool, RowDataPacket } from 'mysql2/promise';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type {
  RegistroDeHistorico,
  RepositorioTrace,
} from '../../src/application/portas/repositorio-trace.js';
import type { Executor } from '../../src/infra/mysql/executor.js';
import { UnidadeDeTrabalhoMysql } from '../../src/infra/mysql/unidade-de-trabalho.js';
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

const ANA = 1;
const BRUNO = 2;
const ELISA = 3;

/** Histórico que falha de verdade no MySQL, depois de a mudança da demanda já ter sido executada. */
class TraceQueFalhaNoBanco implements RepositorioTrace {
  constructor(private readonly executor: Executor) {}

  async registrar(_registro: RegistroDeHistorico): Promise<void> {
    await this.executor.execute('INSERT INTO demand_trace (coluna_que_nao_existe) VALUES (1)');
  }
}

let pool: Pool;
let app: FastifyInstance;
let appComFalhaNoTrace: FastifyInstance;

function reservar(id: number | string, usuarioId = ANA, instancia: FastifyInstance = app) {
  return instancia.inject({ method: 'POST', url: `/demands/${id}/reserve`, headers: cabecalhos(usuarioId) });
}

function encerrar(
  id: number | string,
  corpo: unknown,
  headers: Record<string, string> = cabecalhos(ANA),
  instancia: FastifyInstance = app,
) {
  return instancia.inject({ method: 'POST', url: `/demands/${id}/finish`, headers, payload: corpo as object });
}

async function totalDeLinhasDeTrace(): Promise<number> {
  const [linhas] = await pool.query<RowDataPacket[]>('SELECT COUNT(*) AS total FROM demand_trace');
  return Number(linhas[0]?.total);
}

beforeAll(() => {
  pool = criarPoolDeTeste();
  app = construirAppDeTeste(pool);
  appComFalhaNoTrace = construirAppDeTeste(pool, {
    unidadeDeTrabalho: new UnidadeDeTrabalhoMysql(pool, (executor) => new TraceQueFalhaNoBanco(executor)),
  });
});

afterAll(async () => {
  await app.close();
  await appComFalhaNoTrace.close();
  await limparTabelas(pool);
  await pool.end();
});

beforeEach(async () => {
  await limparTabelas(pool);
  await inserirUsuario(pool, { id: ANA, name: 'Ana Lima' });
  await inserirUsuario(pool, { id: BRUNO, name: 'Bruno Costa' });
  await inserirUsuario(pool, { id: ELISA, name: 'Elisa Ramos' });
});

describe('demand_trace: o que é gravado', () => {
  it('a reserva efetiva grava 1 linha, sem observação e com data preenchida', async () => {
    const id = await inserirDemanda(pool);

    expect((await reservar(id)).statusCode).toBe(200);

    const historico = await lerTrace(pool, id);
    expect(historico).toEqual([{ demand_id: id, user_id: ANA, action: 'reservada', note: null }]);

    const [datas] = await pool.execute<RowDataPacket[]>(
      'SELECT TIMESTAMPDIFF(SECOND, created_at, NOW()) AS segundos FROM demand_trace WHERE demand_id = ?',
      [id],
    );
    expect(Number(datas[0]?.segundos)).toBeGreaterThanOrEqual(0);
    expect(Number(datas[0]?.segundos)).toBeLessThan(10);
  });

  it('o encerramento grava 1 linha com a observação informada', async () => {
    const id = await inserirDemanda(pool, { status: 2, workerId: ANA });

    expect((await encerrar(id, { outcome: 'success', note: 'Tudo certo' })).statusCode).toBe(200);

    expect(await lerTrace(pool, id)).toEqual([
      { demand_id: id, user_id: ANA, action: 'encerrada', note: 'Tudo certo' },
    ]);
  });

  it('o ciclo completo deixa a história em ordem: reservada e depois encerrada', async () => {
    const id = await inserirDemanda(pool);

    await reservar(id, BRUNO);
    await encerrar(id, { outcome: 'failure', failureReason: 'Sem cobertura', note: 'Área sem sinal' }, cabecalhos(BRUNO));

    expect(await lerTrace(pool, id)).toEqual([
      { demand_id: id, user_id: BRUNO, action: 'reservada', note: null },
      { demand_id: id, user_id: BRUNO, action: 'encerrada', note: 'Área sem sinal' },
    ]);
  });

  it('o histórico de uma demanda não mistura linhas de outra', async () => {
    const a = await inserirDemanda(pool);
    const b = await inserirDemanda(pool);

    await reservar(a, ANA);
    await reservar(b, BRUNO);

    expect(await lerTrace(pool, a)).toEqual([{ demand_id: a, user_id: ANA, action: 'reservada', note: null }]);
    expect(await lerTrace(pool, b)).toEqual([{ demand_id: b, user_id: BRUNO, action: 'reservada', note: null }]);
  });
});

describe('demand_trace: recusas não gravam nada', () => {
  it('reserva repetida do próprio dono não grava outra linha', async () => {
    const id = await inserirDemanda(pool);
    await reservar(id, ANA);

    const repetida = await reservar(id, ANA);

    expect(repetida.statusCode).toBe(200);
    expect(await lerTrace(pool, id)).toHaveLength(1);
  });

  it('reserva de demanda inexistente (404)', async () => {
    expect((await reservar(999_999)).statusCode).toBe(404);
    expect(await totalDeLinhasDeTrace()).toBe(0);
  });

  it('reserva perdida (409 reservada por outro) e reserva de encerrada (409)', async () => {
    const reservada = await inserirDemanda(pool, { status: 2, workerId: ANA });
    const encerrada = await inserirDemanda(pool, { status: 3, workerId: ANA, outcome: 'success' });

    expect((await reservar(reservada, BRUNO)).statusCode).toBe(409);
    expect((await reservar(encerrada, BRUNO)).statusCode).toBe(409);

    expect(await totalDeLinhasDeTrace()).toBe(0);
  });

  it('reserva sem permissão (403) e sem autenticação (401)', async () => {
    const id = await inserirDemanda(pool);

    const semEscopo = await app.inject({ method: 'POST', url: `/demands/${id}/reserve`, headers: cabecalhos(ANA, []) });
    const semUsuario = await app.inject({ method: 'POST', url: `/demands/${id}/reserve` });

    expect(semEscopo.statusCode).toBe(403);
    expect(semUsuario.statusCode).toBe(401);
    expect(await totalDeLinhasDeTrace()).toBe(0);
  });

  it('reserva com id inválido (400)', async () => {
    expect((await reservar('abc')).statusCode).toBe(400);
    expect(await totalDeLinhasDeTrace()).toBe(0);
  });

  it('encerramento: 400, 404, 409 e 403 não gravam nada e não alteram a demanda', async () => {
    const reservadaPelaAna = await inserirDemanda(pool, { status: 2, workerId: ANA });
    const aberta = await inserirDemanda(pool, { status: 1 });

    const invalido = await encerrar(reservadaPelaAna, { outcome: 'failure' });
    const inexistente = await encerrar(999_999, { outcome: 'success' });
    const naoReservada = await encerrar(aberta, { outcome: 'success' });
    const semPermissao = await encerrar(reservadaPelaAna, { outcome: 'success' }, cabecalhos(BRUNO));

    expect([invalido, inexistente, naoReservada, semPermissao].map((r) => r.statusCode)).toEqual([
      400, 404, 409, 403,
    ]);
    expect(await totalDeLinhasDeTrace()).toBe(0);
    expect(await lerDemandaCompleta(pool, reservadaPelaAna)).toMatchObject({ status: 2, worker_id: ANA, outcome: null });
    expect(await lerDemandaCompleta(pool, aberta)).toMatchObject({ status: 1, outcome: null });
  });

  it('a supervisão que encerra deixa 1 linha, em nome de quem encerrou', async () => {
    const id = await inserirDemanda(pool, { status: 2, workerId: ANA });

    await encerrar(id, { outcome: 'success' }, cabecalhos(ELISA, ['demands', 'demands:supervise']));

    expect(await lerTrace(pool, id)).toEqual([{ demand_id: id, user_id: ELISA, action: 'encerrada', note: null }]);
  });
});

describe('demand_trace: atomicidade com a mudança da demanda', () => {
  it('reserva: se o INSERT do histórico falha, a reserva é desfeita', async () => {
    const id = await inserirDemanda(pool);

    const resposta = await reservar(id, ANA, appComFalhaNoTrace);

    expect(resposta.statusCode).toBe(500);
    expect(resposta.json()).toEqual({ code: 'ERRO_INTERNO', message: 'Erro interno. Tente novamente mais tarde.' });
    expect(resposta.body).not.toMatch(/coluna_que_nao_existe|demand_trace|ER_|SQL/i);
    expect(await lerDemandaCompleta(pool, id)).toMatchObject({ status: 1, worker_id: null });
    expect(await totalDeLinhasDeTrace()).toBe(0);
  });

  it('encerramento: se o INSERT do histórico falha, o encerramento é desfeito', async () => {
    const id = await inserirDemanda(pool, { status: 2, workerId: ANA });

    const resposta = await encerrar(
      id,
      { outcome: 'failure', failureReason: 'Sem cobertura', note: 'tentativa' },
      cabecalhos(ANA),
      appComFalhaNoTrace,
    );

    expect(resposta.statusCode).toBe(500);
    expect(await lerDemandaCompleta(pool, id)).toMatchObject({
      status: 2,
      worker_id: ANA,
      outcome: null,
      failure_reason: null,
      note: null,
    });
    expect(await totalDeLinhasDeTrace()).toBe(0);
  });

  it('depois de uma falha, a mesma demanda ainda pode ser reservada normalmente', async () => {
    const id = await inserirDemanda(pool);
    await reservar(id, ANA, appComFalhaNoTrace);

    const ok = await reservar(id, BRUNO);

    expect(ok.statusCode).toBe(200);
    expect(await lerTrace(pool, id)).toEqual([{ demand_id: id, user_id: BRUNO, action: 'reservada', note: null }]);
  });
});
