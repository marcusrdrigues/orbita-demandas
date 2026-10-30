import type { RowDataPacket } from 'mysql2/promise';
import type { RepositorioUsuarios } from '../../application/portas/repositorio-usuarios.js';
import type { Usuario } from '../../domain/usuario.js';
import type { Executor } from './executor.js';

interface LinhaUsuario extends RowDataPacket {
  id: number;
  name: string;
}

export class RepositorioUsuariosMysql implements RepositorioUsuarios {
  constructor(private readonly executor: Executor) {}

  async buscarPorId(usuarioId: number): Promise<Usuario | null> {
    const [linhas] = await this.executor.execute<LinhaUsuario[]>(
      'SELECT id, name FROM app_user WHERE id = ?',
      [usuarioId],
    );
    const linha = linhas[0];
    return linha ? { id: linha.id, name: linha.name } : null;
  }
}
