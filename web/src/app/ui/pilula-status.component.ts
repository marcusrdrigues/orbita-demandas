import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { StatusDemanda } from '../core/demandas.service';

const ROTULOS: Record<StatusDemanda, string> = { 1: 'Aberta', 2: 'Reservada', 3: 'Encerrada' };
const NOMES: Record<StatusDemanda, string> = { 1: 'aberta', 2: 'reservada', 3: 'encerrada' };

/** Status como pílula colorida. O texto sempre acompanha a cor, que nunca é a única pista. */
@Component({
  selector: 'app-pilula-status',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class]': "'pilula pilula-' + nome()" },
  template: `<span class="ponto" aria-hidden="true"></span>{{ rotulo() }}`,
  styleUrl: './pilula-status.component.css',
})
export class PilulaStatusComponent {
  readonly status = input.required<StatusDemanda>();

  protected readonly rotulo = computed(() => ROTULOS[this.status()]);
  protected readonly nome = computed(() => NOMES[this.status()]);
}
