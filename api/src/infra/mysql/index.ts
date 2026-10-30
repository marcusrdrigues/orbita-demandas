import type { Pool } from 'mysql2/promise';
import type { RepositorioDemandas } from '../../application/portas/repositorio-demandas.js';
import type { RepositorioUsuarios } from '../../application/portas/repositorio-usuarios.js';
import type { UnidadeDeTrabalho } from '../../application/portas/unidade-de-trabalho.js';
import { RepositorioDemandasMysql } from './repositorio-demandas.js';
import { RepositorioUsuariosMysql } from './repositorio-usuarios.js';
import { UnidadeDeTrabalhoMysql } from './unidade-de-trabalho.js';

export interface Adaptadores {
  usuarios: RepositorioUsuarios;
  demandas: RepositorioDemandas;
  unidadeDeTrabalho: UnidadeDeTrabalho;
}

export function criarAdaptadores(pool: Pool): Adaptadores {
  return {
    usuarios: new RepositorioUsuariosMysql(pool),
    demandas: new RepositorioDemandasMysql(pool),
    unidadeDeTrabalho: new UnidadeDeTrabalhoMysql(pool),
  };
}
