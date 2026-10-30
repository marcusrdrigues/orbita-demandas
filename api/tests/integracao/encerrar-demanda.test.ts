import type { FastifyInstance } from 'fastify';
import type { Pool } from 'mysql2/promise';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
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

const ANA = 1; // dona das reservas
const BRUNO = 2; // outro operador
const ELISA = 3; // supervisora

const SUPERVISAO = ['demands', 'demands:supervise'];

let pool: Pool;
let app: FastifyInstance;

async function encerrar(id: number | string, corpo?: unknown, headers: Record<string, string> = cabecalhos(ANA)) {
  const resposta = await app.inject({
    method: 'POST',
    url: `/demands/${id}/finish`,
    headers,
    ...(corpo === undefined ? {} : { payload: corpo as object }),
  });
  return { status: resposta.statusCode, corpo: resposta.json(), texto: resposta.body };
}

/** Demanda reservada pela Ana, pronta para encerrar. */
function reservadaPelaAna() {
  return inserirDemanda(pool, { status: 2, workerId: ANA });
}

const SEM_VAZAMENTO = /stack|\bat\s+\S+\s+\(|\.ts\b|\bError\b|node_modules/;
const EM_INGLES = /\b(Invalid|Expected|Required|received|Unrecognized)\b/;

beforeAll(() => {
  pool = criarPoolDeTeste();
  app = construirAppDeTeste(pool);
});

afterAll(async () => {
  await app.close();
  await limparTabelas(pool);
  await pool.end();
});

beforeEach(async () => {
  await limparTabelas(pool);
  await inserirUsuario(pool, { id: ANA, name: 'Ana Lima' });
  await inserirUsuario(pool, { id: BRUNO, name: 'Bruno Costa' });
  await inserirUsuario(pool, { id: ELISA, name: 'Elisa Ramos' });
});

describe('POST /demands/:id/finish: encerramento válido', () => {
  it('o dono encerra com sucesso', async () => {
    const id = await reservadaPelaAna();

    const { status, corpo } = await encerrar(id, { outcome: 'success' });

    expect(status).toBe(200);
    expect(corpo).toMatchObject({
      id,
      status: 3,
      outcome: 'success',
      failureReason: null,
      note: null,
      workerId: ANA,
      workerName: 'Ana Lima',
    });
    expect(await lerDemandaCompleta(pool, id)).toMatchObject({
      status: 3,
      outcome: 'success',
      failure_reason: null,
      note: null,
    });
  });

  it('o dono encerra com insucesso e motivo de 1 e de 40 caracteres', async () => {
    const curto = await reservadaPelaAna();
    const longo = await reservadaPelaAna();
    const motivo40 = 'm'.repeat(40);

    const a = await encerrar(curto, { outcome: 'failure', failureReason: 'x' });
    const b = await encerrar(longo, { outcome: 'failure', failureReason: motivo40 });

    expect(a.status).toBe(200);
    expect(a.corpo).toMatchObject({ status: 3, outcome: 'failure', failureReason: 'x' });
    expect(b.status).toBe(200);
    expect(b.corpo.failureReason).toBe(motivo40);
  });

  it('grava a observação, inclusive com 500 caracteres', async () => {
    const id = await reservadaPelaAna();
    const nota = 'n'.repeat(500);

    const { status, corpo } = await encerrar(id, { outcome: 'success', note: nota });

    expect(status).toBe(200);
    expect(corpo.note).toBe(nota);
    expect((await lerDemandaCompleta(pool, id))?.note).toBe(nota);
  });

  it('observação vazia ou só com espaços vira nula', async () => {
    const id = await reservadaPelaAna();

    const { status, corpo } = await encerrar(id, { outcome: 'success', note: '   ' });

    expect(status).toBe(200);
    expect(corpo.note).toBeNull();
  });

  it('grava um registro de histórico com o usuário que encerrou e a observação', async () => {
    const id = await reservadaPelaAna();

    await encerrar(id, { outcome: 'failure', failureReason: 'Cliente ausente', note: 'Liguei duas vezes' });

    expect(await lerTrace(pool, id)).toEqual([
      { demand_id: id, user_id: ANA, action: 'encerrada', note: 'Liguei duas vezes' },
    ]);
  });

  it('quem tem só demands:supervise e é o dono também encerra', async () => {
    const id = await reservadaPelaAna();

    const { status } = await encerrar(id, { outcome: 'success' }, cabecalhos(ANA, ['demands:supervise']));

    expect(status).toBe(200);
  });
});

describe('POST /demands/:id/finish: corpo inválido → 400 e nada muda', () => {
  const casos: Array<[string, unknown]> = [
    ['insucesso sem motivo', { outcome: 'failure' }],
    ['insucesso com motivo vazio', { outcome: 'failure', failureReason: '' }],
    ['insucesso com motivo só de espaços', { outcome: 'failure', failureReason: '   ' }],
    ['motivo com 41 caracteres', { outcome: 'failure', failureReason: 'm'.repeat(41) }],
    ['sucesso com motivo', { outcome: 'success', failureReason: 'Cliente ausente' }],
    ['observação com 501 caracteres', { outcome: 'success', note: 'n'.repeat(501) }],
    ['resultado desconhecido', { outcome: 'cancelled' }],
    ['resultado ausente', { note: 'oi' }],
    ['campo extra', { outcome: 'success', extra: 1 }],
    ['motivo com tipo errado', { outcome: 'failure', failureReason: 123 }],
    ['corpo vazio', {}],
  ];

  it.each(casos)('%s', async (_nome, corpoInvalido) => {
    const id = await reservadaPelaAna();

    const { status, corpo, texto } = await encerrar(id, corpoInvalido);

    expect(status).toBe(400);
    expect(corpo.code).toBe('REQUISICAO_INVALIDA');
    expect(corpo.message).toBe('Requisição inválida.');
    expect(corpo.details.length).toBeGreaterThan(0);
    for (const detalhe of corpo.details) {
      expect(detalhe.message).not.toMatch(EM_INGLES);
    }
    expect(texto).not.toMatch(SEM_VAZAMENTO);
    expect(await lerDemandaCompleta(pool, id)).toMatchObject({ status: 2, worker_id: ANA, outcome: null });
    expect(await lerTrace(pool, id)).toHaveLength(0);
  });

  it('sem corpo → 400', async () => {
    const id = await reservadaPelaAna();

    const { status } = await encerrar(id);

    expect(status).toBe(400);
  });

  it.each(['abc', '0', '-1', '1.5'])('id inválido (%s) → 400', async (id) => {
    const { status } = await encerrar(id, { outcome: 'success' });
    expect(status).toBe(400);
  });
});

describe('POST /demands/:id/finish: ordem das checagens 404 → 409 → 403', () => {
  it('404: a demanda não existe (antes de olhar dono ou estado)', async () => {
    const { status, corpo } = await encerrar(999_999, { outcome: 'success' }, cabecalhos(BRUNO));

    expect(status).toBe(404);
    expect(corpo).toEqual({ code: 'DEMANDA_NAO_ENCONTRADA', message: 'Demanda não encontrada.' });
  });

  it('409: demanda aberta → 409, e não 403, mesmo para quem não seria dono', async () => {
    const id = await inserirDemanda(pool, { status: 1 });

    const { status, corpo } = await encerrar(id, { outcome: 'success' }, cabecalhos(BRUNO));

    expect(status).toBe(409);
    expect(corpo.code).toBe('DEMANDA_NAO_RESERVADA');
    expect(corpo.message).toBe('Só é possível encerrar uma demanda que está reservada.');
    expect(await lerDemandaCompleta(pool, id)).toMatchObject({ status: 1, outcome: null });
  });

  it('409: demanda já encerrada → 409, e não 403, mesmo para quem não é o dono', async () => {
    const id = await inserirDemanda(pool, { status: 3, workerId: ANA, outcome: 'success' });

    const { status, corpo } = await encerrar(id, { outcome: 'failure', failureReason: 'x' }, cabecalhos(BRUNO));

    expect(status).toBe(409);
    expect(corpo.code).toBe('DEMANDA_NAO_RESERVADA');
    expect(await lerDemandaCompleta(pool, id)).toMatchObject({ status: 3, outcome: 'success' });
  });

  it('409: o próprio dono não encerra duas vezes', async () => {
    const id = await reservadaPelaAna();
    await encerrar(id, { outcome: 'success' });

    const { status } = await encerrar(id, { outcome: 'success' });

    expect(status).toBe(409);
    expect(await lerTrace(pool, id)).toHaveLength(1);
  });

  it('403: reservada por outro, sem supervisão → 403 e nada muda', async () => {
    const id = await reservadaPelaAna();

    const { status, corpo, texto } = await encerrar(id, { outcome: 'success' }, cabecalhos(BRUNO));

    expect(status).toBe(403);
    expect(corpo.code).toBe('SEM_PERMISSAO');
    expect(texto).not.toMatch(SEM_VAZAMENTO);
    expect(await lerDemandaCompleta(pool, id)).toMatchObject({ status: 2, worker_id: ANA, outcome: null });
    expect(await lerTrace(pool, id)).toHaveLength(0);
  });

  it('200: reservada por outro, mas com demands:supervise → encerra', async () => {
    const id = await reservadaPelaAna();

    const { status, corpo } = await encerrar(id, { outcome: 'success' }, cabecalhos(ELISA, SUPERVISAO));

    expect(status).toBe(200);
    expect(corpo).toMatchObject({ status: 3, outcome: 'success', workerId: ANA });
    // O histórico registra quem encerrou (a supervisora), não o dono da reserva.
    expect(await lerTrace(pool, id)).toEqual([{ demand_id: id, user_id: ELISA, action: 'encerrada', note: null }]);
  });

  it('400 vem antes do 404: corpo inválido numa demanda inexistente → 400', async () => {
    const { status } = await encerrar(999_999, { outcome: 'failure' });
    expect(status).toBe(400);
  });

  it('403 de escopo vem antes de tudo: sem demands/demands:supervise → 403, mesmo se a demanda não existe', async () => {
    const { status, corpo } = await encerrar(999_999, { outcome: 'success' }, cabecalhos(ANA, ['outro']));

    expect(status).toBe(403);
    expect(corpo.code).toBe('SEM_PERMISSAO');
  });

  it('401 sem x-user-id', async () => {
    const id = await reservadaPelaAna();

    const { status } = await encerrar(id, { outcome: 'success' }, {});

    expect(status).toBe(401);
  });
});

describe('POST /demands/:id/finish: concorrência', () => {
  it('dois encerramentos simultâneos da mesma demanda: um 200 e um 409, com um único histórico', async () => {
    for (let rodada = 1; rodada <= 10; rodada++) {
      const id = await reservadaPelaAna();

      const respostas = await Promise.all([
        encerrar(id, { outcome: 'success' }, cabecalhos(ANA)),
        encerrar(id, { outcome: 'failure', failureReason: 'Sem cobertura' }, cabecalhos(ELISA, SUPERVISAO)),
      ]);

      expect(respostas.map((r) => r.status).sort(), `rodada ${rodada}`).toEqual([200, 409]);
      expect(await lerTrace(pool, id), `rodada ${rodada}`).toHaveLength(1);
      expect((await lerDemandaCompleta(pool, id))?.status).toBe(3);
    }
  });
});
