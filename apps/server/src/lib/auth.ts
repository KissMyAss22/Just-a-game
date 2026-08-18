import type { FastifyReply, FastifyRequest } from 'fastify';

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: { sub: string };
    user: { sub: string };
  }
}

/** preHandler die een geldig token eist en de speler-id beschikbaar maakt. */
export async function authenticate(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  try {
    await request.jwtVerify();
  } catch {
    await reply.code(401).send({ error: 'unauthorized', message: 'Log opnieuw in.' });
  }
}

export function playerIdOf(request: FastifyRequest): string {
  const sub = request.user?.sub;
  if (!sub) throw new Error('Geen speler in het token.');
  return sub;
}
