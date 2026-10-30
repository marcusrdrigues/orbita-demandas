import type { FastifyError, FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { hasZodFastifySchemaValidationErrors } from 'fastify-type-provider-zod';
import {
  DemandaEncerrada,
  DemandaJaReservada,
  DemandaNaoEncontrada,
  DemandaNaoReservada,
  ErroDeDominio,
  NaoAutenticado,
  SemPermissao,
} from '../domain/erros.js';

interface Detalhe {
  field: string;
  message: string;
}

const MENSAGENS_DE_REQUISICAO: Record<number, string> = {
  413: 'Corpo da requisição grande demais.',
  415: 'Tipo de conteúdo não suportado.',
};

function statusDoErroDeDominio(erro: ErroDeDominio): number {
  if (erro instanceof NaoAutenticado) return 401;
  if (erro instanceof SemPermissao) return 403;
  if (erro instanceof DemandaNaoEncontrada) return 404;
  if (
    erro instanceof DemandaJaReservada ||
    erro instanceof DemandaEncerrada ||
    erro instanceof DemandaNaoReservada
  ) {
    return 409;
  }
  return 500;
}

function corpoDoErroDeDominio(erro: ErroDeDominio): Record<string, unknown> {
  const corpo: Record<string, unknown> = { code: erro.codigo, message: erro.message };
  if (erro instanceof DemandaJaReservada) {
    corpo.holder = { id: erro.dono.id, name: erro.dono.name };
    corpo.demanda = erro.demanda;
  } else if (erro instanceof DemandaEncerrada) {
    corpo.demanda = erro.demanda;
  }
  return corpo;
}

function detalhesDeValidacao(erro: FastifyError): Detalhe[] {
  return (erro.validation ?? []).map((falha) => {
    const caminho = falha.instancePath.replace(/^\//, '').replaceAll('/', '.');
    const chaves = (falha.params as { keys?: unknown } | undefined)?.keys;
    const campo = caminho !== '' ? caminho : Array.isArray(chaves) ? chaves.join(', ') : 'requisição';
    return { field: campo, message: falha.message ?? 'Valor inválido.' };
  });
}

function tratarErro(erro: FastifyError, request: FastifyRequest, reply: FastifyReply) {
  if (erro instanceof ErroDeDominio) {
    return reply.code(statusDoErroDeDominio(erro)).send(corpoDoErroDeDominio(erro));
  }

  if (hasZodFastifySchemaValidationErrors(erro)) {
    return reply.code(400).send({
      code: 'REQUISICAO_INVALIDA',
      message: 'Requisição inválida.',
      details: detalhesDeValidacao(erro),
    });
  }

  // Erros 4xx do próprio Fastify (JSON malformado, corpo grande, tipo de conteúdo).
  if (erro.statusCode !== undefined && erro.statusCode >= 400 && erro.statusCode < 500) {
    return reply.code(erro.statusCode).send({
      code: 'REQUISICAO_INVALIDA',
      message: MENSAGENS_DE_REQUISICAO[erro.statusCode] ?? 'Requisição inválida.',
    });
  }

  // Log sem o objeto de erro inteiro: erros do mysql2 carregam o SQL (às vezes com valores).
  request.log.error(
    { erro: { nome: erro.name, codigo: erro.code, mensagem: erro.message, stack: erro.stack } },
    'Erro não tratado',
  );
  return reply.code(500).send({
    code: 'ERRO_INTERNO',
    message: 'Erro interno. Tente novamente mais tarde.',
  });
}

/** Tradução central de erros para HTTP: nada de regra de negócio nas rotas. */
export function registrarTratadorDeErros(app: FastifyInstance): void {
  app.setErrorHandler(tratarErro);
  app.setNotFoundHandler((_request, reply) =>
    reply.code(404).send({ code: 'ROTA_NAO_ENCONTRADA', message: 'Rota não encontrada.' }),
  );
}
