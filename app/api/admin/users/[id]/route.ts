import { NextResponse } from 'next/server';
import { getAuthenticatedRequestUser } from '@/lib/auth/session';
import { requireRoot } from '@/lib/admin-auth';
import { updateManagedUser } from '@/lib/db/admin-user-store';

export const dynamic = 'force-dynamic';

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const authError = requireRoot(req);
  if (authError) return authError;

  const actor = getAuthenticatedRequestUser(req);
  if (!actor) {
    return NextResponse.json({ error: 'Login required' }, { status: 401 });
  }

  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as {
    role?: unknown;
    status?: unknown;
  };

  try {
    const user = updateManagedUser({
      actorUserId: actor.id,
      userId: id,
      role: typeof body.role === 'string' ? body.role : null,
      status: typeof body.status === 'string' ? body.status : null,
    });
    return NextResponse.json({ user });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Update failed.' },
      { status: 400 },
    );
  }
}
