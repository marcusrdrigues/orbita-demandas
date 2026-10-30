export interface UsuarioSimulado {
  id: number;
  nome: string;
  escopos: readonly string[];
}

/**
 * Usuários da base de exemplo (db/seed.sql). A autenticação desta versão mínima é só por
 * cabeçalho: o seletor "Entrando como" escolhe quem as requisições dizem ser.
 */
export const USUARIOS_SIMULADOS: readonly UsuarioSimulado[] = [
  { id: 1, nome: 'Ana Lima', escopos: ['demands'] },
  { id: 2, nome: 'Bruno Costa', escopos: ['demands'] },
  { id: 3, nome: 'Carla Souza', escopos: ['demands'] },
  { id: 4, nome: 'Diego Alves', escopos: ['demands'] },
  { id: 5, nome: 'Elisa Ramos (supervisão)', escopos: ['demands', 'demands:supervise'] },
];
