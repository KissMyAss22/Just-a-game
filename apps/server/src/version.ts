import { execFileSync } from 'node:child_process';

/**
 * Welke versie van de code draait dit proces?
 *
 * Waarom dit bestaat: er kunnen zomaar drie servers tegelijk draaien — een oude
 * die nog op poort 4000 zit en twee nieuwe die er niet bij kunnen. Dan praat je
 * telefoon met code van een uur geleden en zoek je een fout die allang weg is.
 * Dat is deze week meerdere keren gebeurd, en één keer bij mij tijdens het
 * onderzoeken ervan.
 *
 * Eén keer uitgelezen bij het starten, want de hash verandert niet meer zolang
 * dit proces leeft — en dat is precies het punt: hij hoort te blijven staan op
 * wat er gestart is, niet mee te veranderen met de werkmap.
 */
function gitHash(): string {
  try {
    return execFileSync('git', ['rev-parse', '--short', 'HEAD'], {
      encoding: 'utf8',
      timeout: 2000,
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    // Geen git, of een kopie zonder geschiedenis. Nooit een reden om niet te
    // starten: dit is een hulpmiddel, geen voorwaarde.
    return 'onbekend';
  }
}

export const VERSION = {
  commit: gitHash(),
  startedAt: new Date().toISOString(),
} as const;
