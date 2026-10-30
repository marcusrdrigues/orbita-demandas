import type { Pool, PoolConnection } from 'mysql2/promise';

/** Pool (fora de transação) ou conexão da transação em curso. */
export type Executor = Pool | PoolConnection;
