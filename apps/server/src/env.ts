import 'dotenv/config';

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (!value) {
    throw new Error(
      `Ontbrekende omgevingsvariabele ${name}. Kopieer .env.example naar .env en vul hem aan.`,
    );
  }
  return value;
}

export const env = {
  databaseUrl: required('DATABASE_URL', 'postgresql://game:game@localhost:5432/justagame'),
  jwtSecret: required('JWT_SECRET', 'ontwikkel-secret-niet-gebruiken-in-productie'),
  host: process.env.HOST ?? '0.0.0.0',
  port: Number(process.env.PORT ?? 4000),
  spawnIntervalSeconds: Number(process.env.SPAWN_INTERVAL_SECONDS ?? 20),
  /**
   * Ontwikkelgereedschap: de snelheidscontrole gaat ruim open, zodat de
   * loopsnelheidsknop en de vliegmodus in de app niet meteen door de server
   * worden teruggeduwd.
   *
   * Staat uit tenzij je hem zelf aanzet, en werkt sowieso niet in productie.
   * Anders zou één regel in een .env de hele anti-cheat uitschakelen.
   */
  devTools: process.env.DEV_TOOLS === '1' && process.env.NODE_ENV !== 'production',
  isProduction: process.env.NODE_ENV === 'production',
} as const;
