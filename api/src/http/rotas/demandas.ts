import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import type { ListarDemandas } from '../../application/casos-de-uso/listar-demandas.js';
import {
  esquemaConsultaDeDemandas,
  esquemaErro,
  esquemaPaginaDeDemandas,
} from '../esquemas.js';

export interface CasosDeUsoDeDemandas {
  listarDemandas: ListarDemandas;
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
};
