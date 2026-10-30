import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { UsuarioAtual } from '../core/usuario-atual';

@Component({
  selector: 'app-seletor-usuario',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <label class="seletor">
      Entrando como
      <select (change)="selecionar($event)">
        @for (usuario of usuarioAtual.usuarios; track usuario.id) {
          <option [value]="usuario.id" [selected]="usuario.id === usuarioAtual.usuario().id">
            {{ usuario.nome }}
          </option>
        }
      </select>
    </label>
  `,
  styles: `
    .seletor {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      font-size: 0.9rem;
    }
  `,
})
export class SeletorUsuarioComponent {
  protected readonly usuarioAtual = inject(UsuarioAtual);

  protected selecionar(evento: Event): void {
    this.usuarioAtual.selecionar(Number((evento.target as HTMLSelectElement).value));
  }
}
