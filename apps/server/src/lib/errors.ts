/** Fout die netjes als HTTP-antwoord naar de client gaat. */
export class GameError extends Error {
  constructor(
    message: string,
    readonly statusCode = 400,
    readonly code = 'game_error',
  ) {
    super(message);
    this.name = 'GameError';
  }
}

export const notEnoughCash = (needed: number, has: number) =>
  new GameError(`Je hebt ${needed} nodig maar hebt ${has}.`, 400, 'not_enough_cash');

export const notEnoughGems = () =>
  new GameError('Je hebt niet genoeg gems.', 400, 'not_enough_gems');

export const notFound = (what: string) => new GameError(`${what} niet gevonden.`, 404, 'not_found');

export const levelTooLow = (required: number) =>
  new GameError(`Hiervoor heb je level ${required} nodig.`, 400, 'level_too_low');
