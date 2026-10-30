import Fastify, { type FastifyInstance } from 'fastify';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { RepositorioDemandas } from '../application/portas/repositorio-demandas.js';
import type { RepositorioUsuarios } from '../application/portas/repositorio-usuarios.js';
import type { UnidadeDeTrabalho } from '../application/portas/unidade-de-trabalho.js';
import { ListarDemandas } from '../application/casos-de-uso/listar-demandas.js';
import { ReservarDemanda } from '../application/casos-de-uso/reservar-demanda.js';
import { criarHookDeAutenticacao } from './autenticacao.js';
import { registrarTratadorDeErros } from './erros.js';
import { rotasDemandas } from './rotas/demandas.js';

// Mensagens de validação do Zod em português.
z.config(z.locales.ptBR());

export interface Dependencias {
  usuarios: RepositorioUsuarios;
  demandas: RepositorioDemandas;
  unidadeDeTrabalho: UnidadeDeTrabalho;
}

export interface OpcoesDoApp {
  logger?: boolean;
}

/** Monta o Fastify com as dependências recebidas, para os testes poderem trocá-las. */
export function construirApp(dependencias: Dependencias, opcoes: OpcoesDoApp = {}): FastifyInstance {
  const app = Fastify({
    logger: opcoes.logger ?? false,
    bodyLimit: 16 * 1024,
    requestTimeout: 15_000,
  });

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  registrarTratadorDeErros(app);

  // Escopo protegido: tudo que for registrado aqui exige usuário válido e escopo de demandas.
  app.register(async (protegido) => {
    protegido.decorateRequest('operador');
    protegido.addHook('onRequest', criarHookDeAutenticacao(dependencias.usuarios));
    protegido.register(rotasDemandas, {
      listarDemandas: new ListarDemandas(dependencias.demandas),
      reservarDemanda: new ReservarDemanda(dependencias.demandas, dependencias.unidadeDeTrabalho),
    });
  });

  return app;
}
