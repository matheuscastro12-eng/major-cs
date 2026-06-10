// Seed do banco Neon com o dataset base (teams + players + coaches).
// Uso: defina DATABASE_URL e rode o bundle gerado por esbuild (ver README).
import { Client } from 'pg';
import { BASE_TEAMS } from '../src/data/teams';

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL não definida');
  const client = new Client({ connectionString: url });
  await client.connect();

  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM teams'); // re-seed idempotente (cascade limpa players/coaches)

    for (const t of BASE_TEAMS) {
      await client.query(
        `INSERT INTO teams (id, team, tag, era, game, country, teamwork, honors, data)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [t.id, t.team, t.tag, t.era, t.game, t.country, t.teamwork, t.honors, JSON.stringify(t)],
      );
      await client.query(
        `INSERT INTO coaches (team_id, nick, name, country, rating, style) VALUES ($1,$2,$3,$4,$5,$6)`,
        [t.id, t.coach.nick, t.coach.name, t.coach.country, t.coach.rating, t.coach.style],
      );
      let ord = 0;
      for (const p of t.players) {
        await client.query(
          `INSERT INTO players (id, team_id, ord, nick, name, country, role, aim, clutch, consistency, awp, igl)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
          [p.id, t.id, ord++, p.nick, p.name, p.country, p.role, p.aim, p.clutch, p.consistency, p.awp, p.igl],
        );
      }
    }
    await client.query('COMMIT');
    const teams = await client.query('SELECT count(*) FROM teams');
    const players = await client.query('SELECT count(*) FROM players');
    console.log(`Seed OK — ${teams.rows[0].count} times, ${players.rows[0].count} jogadores`);
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
