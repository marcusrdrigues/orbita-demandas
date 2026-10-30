import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const RAIZ_DO_CODIGO = fileURLToPath(new URL('../../src', import.meta.url));

async function listarArquivos(pasta: string): Promise<string[]> {
  const entradas = await readdir(pasta, { withFileTypes: true });
  const arquivos = await Promise.all(
    entradas.map((entrada) =>
      entrada.isDirectory() ? listarArquivos(join(pasta, entrada.name)) : Promise.resolve([join(pasta, entrada.name)]),
    ),
  );
  return arquivos.flat();
}

// O histórico é imutável: o código só insere. Qualquer outra escrita em demand_trace é recusada aqui.
const ESCRITAS_PROIBIDAS = [
  /UPDATE\s+`?demand_trace`?/i,
  /DELETE\s+FROM\s+`?demand_trace`?/i,
  /TRUNCATE\s+(TABLE\s+)?`?demand_trace`?/i,
  /DROP\s+TABLE\s+(IF\s+EXISTS\s+)?`?demand_trace`?/i,
  /REPLACE\s+INTO\s+`?demand_trace`?/i,
  /ALTER\s+TABLE\s+`?demand_trace`?/i,
];

describe('demand_trace é imutável no código', () => {
  it('nenhum arquivo de api/src atualiza, apaga ou altera demand_trace', async () => {
    const arquivos = (await listarArquivos(RAIZ_DO_CODIGO)).filter((caminho) => caminho.endsWith('.ts'));
    expect(arquivos.length).toBeGreaterThan(10); // garante que a varredura achou o código

    const violacoes: string[] = [];
    for (const caminho of arquivos) {
      const conteudo = await readFile(caminho, 'utf8');
      for (const proibida of ESCRITAS_PROIBIDAS) {
        if (proibida.test(conteudo)) {
          violacoes.push(`${caminho}: ${proibida}`);
        }
      }
    }

    expect(violacoes).toEqual([]);
  });

  it('a única escrita em demand_trace é o INSERT do repositório de histórico', async () => {
    const arquivos = (await listarArquivos(RAIZ_DO_CODIGO)).filter((caminho) => caminho.endsWith('.ts'));
    const comEscrita: string[] = [];
    for (const caminho of arquivos) {
      const conteudo = await readFile(caminho, 'utf8');
      if (/INSERT\s+INTO\s+demand_trace/i.test(conteudo)) {
        comEscrita.push(caminho.replace(RAIZ_DO_CODIGO, '').replaceAll('\\', '/'));
      }
    }

    expect(comEscrita).toEqual(['/infra/mysql/repositorio-trace.ts']);
  });
});
