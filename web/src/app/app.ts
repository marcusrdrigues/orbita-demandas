import { ChangeDetectionStrategy, Component } from '@angular/core';
import { ListaDemandasComponent } from './demandas/lista-demandas.component';
import { SeletorUsuarioComponent } from './demandas/seletor-usuario.component';

@Component({
  selector: 'app-root',
  imports: [SeletorUsuarioComponent, ListaDemandasComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {}
