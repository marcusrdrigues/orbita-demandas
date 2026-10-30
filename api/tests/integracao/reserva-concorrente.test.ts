import type { FastifyInstance } from 'fastify';
import type { Pool } from 'mysql2/promise';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  cabecalhos,
  construirAppDeTeste,
  criarPoolDeTeste,
  inserirDemanda,
  inserirUsuario,
  lerDemanda,
  lerTrace,
  limparTabelas,
} from './ambiente.js';

const RODADAS = 25;
const NOMES: Record<number, string> = {
  1: 'Ana Lima',
  2: 'Bruno Costa',
  3: 'Carla Souza',
  4: 'Diego Alves',
  5: 'Elisa Ramos',
};

let pool: Pool;
let app: FastifyInstance;

function reservar(demandaId: number, usuarioId: number) {
  return app.inject({ method: 'POST', url: `/demands/${demandaId}/reserve`, headers: cabecalhos(usuarioId) });
}

beforeAll(() => {
  // Várias conexões: sem isso as duas reservas não competiriam de fato no banco.
  pool = criarPoolDeTeste(10);
  app = construirAppDeTeste(pool);
});

afterAll(async () => {
  await app.close();
  await limparTabelas(pool);
  await pool.end();
});

beforeEach(async () => {
  await limparTabelas(pool);
  for (const [id, name] of Object.entries(NOMES)) {
    await inserirUsuario(pool, { id: Number(id), name });
  }
});

describe('reservas simultâneas da mesma demanda (FR-017)', () => {
  it(`duas pessoas ao mesmo tempo: um 200 e um 409, repetido ${RODADAS} vezes`, async () => {
    for (let rodada = 1; rodada <= RODADAS; rodada++) {
      const demandaId = await inserirDemanda(pool, { title: `Corrida ${rodada}` });
      // Alterna quem dispara primeiro para a ordem de chegada não favorecer sempre o mesmo usuário.
      const [primeiro, segundo] = rodada % 2 === 0 ? [1, 2] : [2, 1];

      const [a, b] = await Promise.all([reservar(demandaId, primeiro), reservar(demandaId, segundo)]);

      const respostas = [
        { usuarioId: primeiro, resposta: a },
        { usuarioId: segundo, resposta: b },
      ];
      const status = respostas.map((r) => r.resposta.statusCode).sort();
      expect(status, `rodada ${rodada}`).toEqual([200, 409]);

      const vencedor = respostas.find((r) => r.resposta.statusCode === 200)!;
      const perdedor = respostas.find((r) => r.resposta.statusCode === 409)!;
      const conflito = perdedor.resposta.json();

      expect(conflito.code, `rodada ${rodada}`).toBe('DEMANDA_JA_RESERVADA');
      expect(conflito.holder, `rodada ${rodada}`).toEqual({
        id: vencedor.usuarioId,
        name: NOMES[vencedor.usuarioId],
      });
      expect(conflito.message).toBe(`Demanda já reservada por ${NOMES[vencedor.usuarioId]}.`);
      expect(conflito.demanda.workerId).toBe(vencedor.usuarioId);

      expect(await lerDemanda(pool, demandaId), `rodada ${rodada}`).toMatchObject({
        status: 2,
        worker_id: vencedor.usuarioId,
      });
      const historico = await lerTrace(pool, demandaId);
      expect(historico, `rodada ${rodada}`).toHaveLength(1);
      expect(historico[0]).toMatchObject({ user_id: vencedor.usuarioId, action: 'reservada' });
    }
  });

  it('cinco pessoas ao mesmo tempo: exatamente uma ganha e as outras quatro recebem 409', async () => {
    for (let rodada = 1; rodada <= 5; rodada++) {
      const demandaId = await inserirDemanda(pool);

      const respostas = await Promise.all([1, 2, 3, 4, 5].map((usuarioId) => reservar(demandaId, usuarioId)));

      const status = respostas.map((r) => r.statusCode).sort();
      expect(status, `rodada ${rodada}`).toEqual([200, 409, 409, 409, 409]);
      expect(await lerTrace(pool, demandaId), `rodada ${rodada}`).toHaveLength(1);
    }
  });
});
