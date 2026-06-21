// DIAGNÓSTICO TEMPORÁRIO: mostra só os NOMES das envs relevantes (nunca valores).
// Serve pra descobrir como a chave do Stripe foi nomeada no Vercel. Remover depois.
interface Res { status: (code: number) => { json: (b: unknown) => void } }
export default async function handler(_req: unknown, res: Res) {
  const names = Object.keys(process.env).filter((k) => /stripe|app_secret|database_url|neon/i.test(k));
  res.status(200).json({
    matchedNames: names.sort(),
    hasStripe: !!process.env.STRIPE,
    hasStripeSecretKey: !!process.env.STRIPE_SECRET_KEY,
    hasDatabaseUrl: !!process.env.DATABASE_URL,
  });
}
