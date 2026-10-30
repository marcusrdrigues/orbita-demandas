import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { LucideAngularModule, UserRound } from 'lucide-angular';
import { UsuarioAtual } from '../core/usuario-atual';

@Component({
  selector: 'app-seletor-usuario',
  imports: [LucideAngularModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <label class="seletor">
      <lucide-icon [img]="iconeUsuario" [size]="18" aria-hidden="true" />
      <span class="rotulo">Entrando como</span>
      <select (change)="selecionar($event)">
        @for (usuario of usuarioAtual.usuarios; track usuario.id) {
          <option [value]="usuario.id" [selected]="usuario.id === usuarioAtual.usuario().id">
            {{ usuario.nome }}
          </option>
        }
      </select>
    </label>
  `,
  styleUrl: './seletor-usuario.component.css',
})
export class SeletorUsuarioComponent {
  protected readonly usuarioAtual = inject(UsuarioAtual);
  protected readonly iconeUsuario = UserRound;

  protected selecionar(evento: Event): void {
    this.usuarioAtual.selecionar(Number((evento.target as HTMLSelectElement).value));
  }
}
