import { ChangeDetectionStrategy, Component } from '@angular/core';
import { LucideAngularModule, Orbit } from 'lucide-angular';
import { ListaDemandasComponent } from './demandas/lista-demandas.component';
import { SeletorUsuarioComponent } from './demandas/seletor-usuario.component';

@Component({
  selector: 'app-root',
  imports: [LucideAngularModule, SeletorUsuarioComponent, ListaDemandasComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  protected readonly iconeMarca = Orbit;
}
