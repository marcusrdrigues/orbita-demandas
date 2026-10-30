import { StatusDemanda, type Demanda } from '../../domain/demanda.js';
import { DemandaEncerrada, DemandaJaReservada, DemandaNaoEncontrada } from '../../domain/erros.js';
import type { Usuario } from '../../domain/usuario.js';
import type { RepositorioDemandas } from '../portas/repositorio-demandas.js';
import type { UnidadeDeTrabalho } from '../portas/unidade-de-trabalho.js';

export class ReservarDemanda {
  constructor(
    private readonly demandas: RepositorioDemandas,
    private readonly unidadeDeTrabalho: UnidadeDeTrabalho,
  ) {}

  async executar(demandaId: number, usuario: Usuario): Promise<Demanda> {
    // A reserva é uma única instrução condicional (só reserva se ainda estiver aberta), então não
    // há leitura antes da escrita para duas pessoas passarem juntas. O histórico entra na mesma
    // transação, e só para quem de fato reservou: quem perde não grava nada.
    const reservou = await this.unidadeDeTrabalho.executar(async ({ demandas, trace }) => {
      const reservada = await demandas.reservarSeAberta(demandaId, usuario.id);
      if (reservada) {
        await trace.registrar({ demandaId, usuarioId: usuario.id, acao: 'reservada', observacao: null });
      }
      return reservada;
    });

    // Lê o estado confirmado, fora da transação de escrita, para devolver ou explicar o conflito.
    const atual = await this.demandas.buscarPorId(demandaId);
    if (!atual) {
      throw new DemandaNaoEncontrada();
    }
    if (reservou) {
      return atual;
    }

    if (atual.status === StatusDemanda.Encerrada) {
      throw new DemandaEncerrada(atual);
    }
    if (atual.status === StatusDemanda.Reservada && atual.workerId !== null) {
      if (atual.workerId === usuario.id) {
        return atual; // reserva repetida do próprio dono: sucesso, sem mudança
      }
      throw new DemandaJaReservada({ id: atual.workerId, name: atual.workerName ?? '' }, atual);
    }

    // Aberta e mesmo assim a reserva não valeu, ou reservada sem responsável: o estado viola as
    // invariantes. Falha explícita (500 genérico) em vez de inventar uma resposta.
    throw new Error(`Demanda ${demandaId} em estado inesperado após tentativa de reserva`);
  }
}
