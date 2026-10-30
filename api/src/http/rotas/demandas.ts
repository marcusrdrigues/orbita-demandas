import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import type { ListarDemandas } from '../../application/casos-de-uso/listar-demandas.js';
import type { EncerrarDemanda } from '../../application/casos-de-uso/encerrar-demanda.js';
import type { ReservarDemanda } from '../../application/casos-de-uso/reservar-demanda.js';
import {
  esquemaConflitoDeReserva,
  esquemaConsultaDeDemandas,
  esquemaCorpoDeEncerramento,
  esquemaDemanda,
  esquemaErro,
  esquemaPaginaDeDemandas,
  esquemaParametroDeDemanda,
} from '../esquemas.js';

export interface CasosDeUsoDeDemandas {
  listarDemandas: ListarDemandas;
  reservarDemanda: ReservarDemanda;
  encerrarDemanda: EncerrarDemanda;
}

/** Rotas só traduzem HTTP: validam o formato, chamam o caso de uso e devolvem o resultado. */
export const rotasDemandas: FastifyPluginAsyncZod<CasosDeUsoDeDemandas> = async (app, casos) => {
  app.get(
    '/demands',
    {
      schema: {
        querystring: esquemaConsultaDeDemandas,
        response: { 200: esquemaPaginaDeDemandas, 401: esquemaErro, 403: esquemaErro },
      },
    },
    async (request) => casos.listarDemandas.executar(request.query),
  );

  app.post(
    '/demands/:id/reserve',
    {
      schema: {
        params: esquemaParametroDeDemanda,
        response: {
          200: esquemaDemanda,
          401: esquemaErro,
          403: esquemaErro,
          404: esquemaErro,
          409: esquemaConflitoDeReserva,
        },
      },
    },
    async (request) => casos.reservarDemanda.executar(request.params.id, request.operador),
  );

  app.post(
    '/demands/:id/finish',
    {
      schema: {
        params: esquemaParametroDeDemanda,
        body: esquemaCorpoDeEncerramento,
        response: { 200: esquemaDemanda, 401: esquemaErro, 403: esquemaErro, 404: esquemaErro, 409: esquemaErro },
      },
    },
    async (request) => casos.encerrarDemanda.executar(request.params.id, request.operador, request.body),
  );
};
