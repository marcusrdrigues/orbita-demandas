import { Injectable, signal } from '@angular/core';
import { USUARIOS_SIMULADOS, type UsuarioSimulado } from './usuarios-simulados';

@Injectable({ providedIn: 'root' })
export class UsuarioAtual {
  readonly usuarios = USUARIOS_SIMULADOS;

  private readonly _usuario = signal<UsuarioSimulado>(USUARIOS_SIMULADOS[0]!);
  readonly usuario = this._usuario.asReadonly();

  selecionar(id: number): void {
    const escolhido = this.usuarios.find((usuario) => usuario.id === id);
    if (escolhido) {
      this._usuario.set(escolhido);
    }
  }
}
