import type { onRequestAsyncHookHandler } from 'fastify';
import type { RepositorioUsuarios } from '../application/portas/repositorio-usuarios.js';
import { NaoAutenticado, SemPermissao } from '../domain/erros.js';
import { podeOperarFila, type Operador } from '../domain/usuario.js';

declare module 'fastify' {
  interface FastifyRequest {
    /** Preenchido pelo hook de autenticação; só existe nas rotas protegidas. */
    operador: Operador;
  }
}

const ID_DE_USUARIO = /^[1-9]\d{0,9}$/;
const MAIOR_INT_DO_MYSQL = 2_147_483_647;

function unicoValor(cabecalho: string | string[] | undefined): string | undefined {
  return typeof cabecalho === 'string' ? cabecalho : undefined;
}

function lerIdDoUsuario(cabecalho: string | string[] | undefined): number {
  const bruto = unicoValor(cabecalho)?.trim();
  if (bruto === undefined || !ID_DE_USUARIO.test(bruto)) {
    throw new NaoAutenticado();
  }
  const id = Number(bruto);
  if (id > MAIOR_INT_DO_MYSQL) {
    throw new NaoAutenticado();
  }
  return id;
}

function lerEscopos(cabecalho: string | string[] | undefined): Set<string> {
  const bruto = Array.isArray(cabecalho) ? cabecalho.join(',') : (cabecalho ?? '');
  return new Set(
    bruto
      .split(',')
      .map((escopo) => escopo.trim())
      .filter((escopo) => escopo !== ''),
  );
}

/**
 * Autenticação simplificada desta versão mínima: o usuário vem de x-user-id e os escopos de
 * x-scopes. Os cabeçalhos são falsificáveis; em produção isto seria substituído por token.
 * Roda em onRequest, então 401 e 403 saem antes da validação do corpo (400).
 */
export function criarHookDeAutenticacao(usuarios: RepositorioUsuarios): onRequestAsyncHookHandler {
  return async (request) => {
    const usuario = await usuarios.buscarPorId(lerIdDoUsuario(request.headers['x-user-id']));
    if (!usuario) {
      throw new NaoAutenticado();
    }

    const operador: Operador = { ...usuario, escopos: lerEscopos(request.headers['x-scopes']) };
    if (!podeOperarFila(operador)) {
      throw new SemPermissao();
    }
    request.operador = operador;
  };
}
