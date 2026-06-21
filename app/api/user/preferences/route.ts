import { NextResponse } from 'next/server';
import { getAuthenticatedRequestUser, toPublicUser } from '@/lib/auth/session';
import agentDb from '@/lib/db/agent-db';

const MAX_LOCATION_LENGTH = 80;

function normalizeLocation(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().replace(/\s+/g, ' ');
  return normalized ? normalized.slice(0, MAX_LOCATION_LENGTH) : null;
}

export async function PATCH(req: Request) {
  const user = getAuthenticatedRequestUser(req);
  if (!user) {
    return NextResponse.json(
      {
        error: 'Login required',
        authRequired: true,
        loginUrl: '/login?next=/chat',
      },
      { status: 401 },
    );
  }

  const body = await req.json();
  const defaultDepartureLocation = normalizeLocation(
    body.defaultDepartureLocation,
  );

  agentDb
    .prepare(
      `UPDATE users
       SET default_departure_location = ?, updated_at = datetime('now')
       WHERE id = ?`,
    )
    .run(defaultDepartureLocation, user.id);

  return NextResponse.json({
    user: toPublicUser({
      ...user,
      defaultDepartureLocation,
    }),
  });
}
