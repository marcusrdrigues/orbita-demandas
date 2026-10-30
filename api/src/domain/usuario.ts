export const ESCOPO_DEMANDAS = 'demands';
export const ESCOPO_SUPERVISAO = 'demands:supervise';

export interface Usuario {
  id: number;
  name: string;
}

/** Usuário autenticado na requisição, com os escopos declarados em x-scopes. */
export interface Operador extends Usuario {
  escopos: ReadonlySet<string>;
}

export function podeOperarFila(operador: Operador): boolean {
  return operador.escopos.has(ESCOPO_DEMANDAS) || operador.escopos.has(ESCOPO_SUPERVISAO);
}

export function ehSupervisor(operador: Operador): boolean {
  return operador.escopos.has(ESCOPO_SUPERVISAO);
}
