import type { Usuario } from '../../domain/usuario.js';

export interface RepositorioUsuarios {
  buscarPorId(usuarioId: number): Promise<Usuario | null>;
}
