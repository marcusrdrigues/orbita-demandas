import { z } from 'zod';

export const esquemaDemanda = z.object({
  id: z.number().int(),
  title: z.string(),
  queue: z.string(),
  status: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  workerId: z.number().int().nullable(),
  workerName: z.string().nullable(),
  outcome: z.enum(['success', 'failure']).nullable(),
  failureReason: z.string().nullable(),
  note: z.string().nullable(),
  updatedAt: z.date(),
});

// Query estrita: qualquer parâmetro fora desta lista, ou com valor inválido, vira 400.
export const esquemaConsultaDeDemandas = z.strictObject({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  queue: z.string().min(1).max(40).optional(),
  status: z
    .enum(['1', '2', '3'])
    .transform((valor) => Number(valor) as 1 | 2 | 3)
    .optional(),
  sort: z.enum(['id', 'updated_at']).default('id'),
  order: z.enum(['asc', 'desc']).default('asc'),
});

export const esquemaPaginaDeDemandas = z.object({
  items: z.array(esquemaDemanda),
  total: z.number().int(),
  page: z.number().int(),
  pageSize: z.number().int(),
});

export const esquemaErro = z.object({
  code: z.string(),
  message: z.string(),
});

export const esquemaParametroDeDemanda = z.object({
  // INT do MySQL: acima disso a demanda não pode existir.
  id: z.coerce.number().int().positive().max(2_147_483_647),
});

// 409: além do erro, devolve a demanda atual (e o dono, quando está reservada) para o front
// atualizar a linha sem nova consulta.
export const esquemaConflitoDeReserva = esquemaErro.extend({
  holder: z.object({ id: z.number().int(), name: z.string() }).optional(),
  demanda: esquemaDemanda,
});
