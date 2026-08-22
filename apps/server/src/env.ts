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
   * **Aan tijdens het ontwikkelen, en in productie onmogelijk.**
   *
   * Dit stond andersom: uit tenzij je `DEV_TOOLS=1` zette. Dat leverde vooral
   * verwarring op — `.env.example` levert de uitstand, `.env` staat in
   * `.gitignore`, dus je begint standaard zonder gereedschap en er is nergens te
   * zien waarom een knop niets doet. Voor een spel dat door één persoon wordt
   * gebouwd is dat de verkeerde standaard.
   *
   * De bescherming die ertoe doet blijft ongewijzigd: in productie kan dit niet
   * aan, wat er ook in de .env staat. Eén verkeerde .env zet dus nog steeds geen
   * gratis-geldknop op internet. Wel is het nu één vergissing in plaats van twee
   * als je ooit deployt zónder NODE_ENV op production — dat is de prijs, en die
   * is bewust betaald.
   *
   * Uitzetten kan met `DEV_TOOLS=off`, bijvoorbeeld om te zien hoe de app zich
   * gedraagt zonder.
   */
  devTools: process.env.DEV_TOOLS !== 'off' && process.env.NODE_ENV !== 'production',
  isProduction: process.env.NODE_ENV === 'production',
} as const;
