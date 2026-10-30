import { StatusDemanda, type Demanda, type Resultado } from '../../domain/demanda.js';
import {
  DemandaNaoEncontrada,
  DemandaNaoReservada,
  EncerramentoInvalido,
  SemPermissao,
} from '../../domain/erros.js';
import { ehSupervisor, type Operador } from '../../domain/usuario.js';
import type { DadosDeEncerramento, RepositorioDemandas } from '../portas/repositorio-demandas.js';
import type { UnidadeDeTrabalho } from '../portas/unidade-de-trabalho.js';

export interface PedidoDeEncerramento {
  outcome: Resultado;
  failureReason?: string;
  note?: string;
}

/** Aplica as regras de coerência e normaliza o texto: motivo e observação aparados, vazio vira nulo. */
function normalizar(pedido: PedidoDeEncerramento): DadosDeEncerramento {
  const motivo = pedido.failureReason?.trim() || null;
  const observacao = pedido.note?.trim() || null;

  if (pedido.outcome === 'failure' && motivo === null) {
    throw new EncerramentoInvalido('Informe o motivo do insucesso.');
  }
  if (pedido.outcome === 'success' && pedido.failureReason !== undefined) {
    throw new EncerramentoInvalido('O motivo só se aplica ao insucesso.');
  }
  return { outcome: pedido.outcome, failureReason: motivo, note: observacao };
}

export class EncerrarDemanda {
  constructor(
    private readonly demandas: RepositorioDemandas,
    private readonly unidadeDeTrabalho: UnidadeDeTrabalho,
  ) {}

  async executar(demandaId: number, operador: Operador, pedido: PedidoDeEncerramento): Promise<Demanda> {
    const dados = normalizar(pedido);

    // Transação curta, só do banco, dentro desta requisição: trava a linha, decide, grava a
    // mudança e o histórico juntos. Se qualquer passo falhar, tudo é desfeito.
    await this.unidadeDeTrabalho.executar(async ({ demandas, trace }) => {
      const demanda = await demandas.buscarParaAtualizar(demandaId);

      // Ordem fixada pela especificação: 404 → 409 → 403.
      if (!demanda) {
        throw new DemandaNaoEncontrada();
      }
      if (demanda.status !== StatusDemanda.Reservada) {
        throw new DemandaNaoReservada();
      }
      if (demanda.workerId !== operador.id && !ehSupervisor(operador)) {
        throw new SemPermissao('Só quem reservou a demanda, ou a supervisão, pode encerrá-la.');
      }

      await demandas.encerrar(demandaId, dados);
      await trace.registrar({
        demandaId,
        usuarioId: operador.id,
        acao: 'encerrada',
        observacao: dados.note,
      });
    });

    // Estado confirmado, já com o nome do responsável, fora da transação de escrita.
    const atual = await this.demandas.buscarPorId(demandaId);
    if (!atual) {
      throw new Error(`Demanda ${demandaId} sumiu logo após o encerramento`);
    }
    return atual;
  }
}
