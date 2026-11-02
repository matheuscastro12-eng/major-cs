// Roda runs-agregado.sql no Neon SOMENTE se a credencial for realmente somente leitura.
//
//   READONLY_DATABASE_URL='postgresql://usuario_ro:...@.../neondb' npm run stats:runs
//   npm run stats:runs -- --print-sql        # só imprime o SQL (não conecta)
//
// Segurança (tudo é checado ANTES de rodar qualquer consulta):
//  - usa só READONLY_DATABASE_URL; NUNCA lê DATABASE_URL (produção com escrita) nem imprime a URL;
//  - o SQL só pode ter SELECT/WITH (checado por texto) e roda em transação READ ONLY;
//  - o papel não pode ser superuser/createrole/createdb nem ter INSERT/UPDATE/DELETE/TRUNCATE em nenhuma tabela de public;
//  - se qualquer checagem falhar, aborta sem rodar nada.
// Saída: <out-dir>/runs-agregado-<data>.json e .csv (sem dado pessoal).
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { neon } from '@neondatabase/serverless';

const HERE = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const arg = (k: string, d?: string) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : d; };
const sqlText = readFileSync(join(HERE, 'runs-agregado.sql'), 'utf8');
const queries = sqlText.split(/^-- name: /m).slice(1).map((blk) => {
  const [head, ...rest] = blk.split('\n');
  const body = rest.filter((l) => !l.trim().startsWith('--')).join('\n').trim().replace(/;\s*$/, '');
  return { name: head.split(/\s+/)[0], optional: /opcional/.test(head), sql: body };
});

if (argv.includes('--print-sql')) { console.log(sqlText); process.exit(0); }

const FORBIDDEN = /\b(insert|update|delete|drop|alter|create|truncate|grant|revoke|copy|call|do|vacuum|merge|set)\b/i;
for (const q of queries) {
  if (!/^\s*(select|with)\b/i.test(q.sql) || FORBIDDEN.test(q.sql.replace(/'[^']*'/g, "''"))) { console.error(`Consulta "${q.name}" não é um SELECT puro. Abortado.`); process.exit(2); }
}

const url = process.env.READONLY_DATABASE_URL?.trim();
if (!url) {
  console.error('SEM CREDENCIAL: defina READONLY_DATABASE_URL com um usuário Neon SOMENTE LEITURA (precisa do ok do Matheus pra criar).\nEste script nunca usa DATABASE_URL. Use --print-sql pra ver as consultas.');
  process.exit(3);
}
const sql = neon(url);
const one = async (text: string) => (await sql.transaction((t) => [t.query(text)], { readOnly: true }))[0] as Record<string, unknown>[];

const role = (await one(`SELECT current_user AS u, r.rolsuper, r.rolcreaterole, r.rolcreatedb, r.rolreplication, r.rolbypassrls FROM pg_roles r WHERE r.rolname = current_user`))[0];
const writable = await one(`SELECT c.relname AS tabela FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind IN ('r','p') AND (has_table_privilege(current_user, c.oid, 'INSERT') OR has_table_privilege(current_user, c.oid, 'UPDATE') OR has_table_privilege(current_user, c.oid, 'DELETE') OR has_table_privilege(current_user, c.oid, 'TRUNCATE'))`);
const schemaCreate = (await one(`SELECT has_schema_privilege(current_user, 'public', 'CREATE') AS c`))[0]?.c;
const bad: string[] = [];
if (role?.rolsuper || role?.rolcreaterole || role?.rolcreatedb || role?.rolreplication) bad.push('papel com privilégios elevados (superuser/createrole/createdb/replication)');
if (writable.length) bad.push(`papel TEM escrita em: ${writable.map((r) => r.tabela).join(', ')}`);
if (schemaCreate) bad.push('papel pode criar objetos no schema public');
if (bad.length) { console.error('CREDENCIAL NÃO É SOMENTE LEITURA — nada foi executado:\n- ' + bad.join('\n- ')); process.exit(4); }
console.log(`Credencial somente leitura confirmada (papel ${String(role?.u)}). Rodando ${queries.length} consultas…`);

const result: Record<string, unknown> = {};
for (const q of queries) {
  try {
    if (q.optional) {
      const tbl = /FROM\s+(\w+)/i.exec(q.sql)?.[1];
      const ex = (await one(`SELECT to_regclass('public.${tbl}') IS NOT NULL AS ok`))[0]?.ok;
      if (!ex) { result[q.name] = { pulada: `tabela ${tbl} não existe` }; continue; }
    }
    result[q.name] = await one(q.sql);
  } catch (e) { result[q.name] = { erro: (e as Error).message.slice(0, 200) }; }
}
const outDir = resolve(arg('out-dir', '/workspace/major-cs/stats')!);
mkdirSync(outDir, { recursive: true });
const stamp = new Date().toISOString().slice(0, 10);
writeFileSync(join(outDir, `runs-agregado-${stamp}.json`), JSON.stringify({ geradoEm: new Date().toISOString(), consultas: result }, null, 1) + '\n');
const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
const csv = ['consulta,linha,coluna,valor'];
for (const [name, rows] of Object.entries(result)) if (Array.isArray(rows)) rows.forEach((r, i) => Object.entries(r).forEach(([k, v]) => csv.push([name, i + 1, k, esc(v)].join(','))));
writeFileSync(join(outDir, `runs-agregado-${stamp}.csv`), csv.join('\n') + '\n');
console.log(JSON.stringify(result, null, 1));
