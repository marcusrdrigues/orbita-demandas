export interface ConfigBanco {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
}

export interface Config {
  banco: ConfigBanco;
  portaHttp: number;
}

function obrigatoria(env: NodeJS.ProcessEnv, nome: string): string {
  const valor = env[nome];
  if (valor === undefined || valor === '') {
    throw new Error(`Variável de ambiente ${nome} não definida. Veja .env.example.`);
  }
  return valor;
}

function inteiroPositivo(env: NodeJS.ProcessEnv, nome: string): number {
  const valor = Number(obrigatoria(env, nome));
  if (!Number.isInteger(valor) || valor <= 0) {
    throw new Error(`Variável de ambiente ${nome} deve ser um inteiro positivo.`);
  }
  return valor;
}

export function carregarConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return {
    banco: {
      host: obrigatoria(env, 'DB_HOST'),
      port: inteiroPositivo(env, 'DB_PORT'),
      user: obrigatoria(env, 'DB_USER'),
      password: obrigatoria(env, 'DB_PASSWORD'),
      database: obrigatoria(env, 'DB_NAME'),
    },
    portaHttp: inteiroPositivo(env, 'PORT'),
  };
}
