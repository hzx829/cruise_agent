import { deleteChat } from '@/lib/db/chat-store';
import { NextResponse } from 'next/server';
import { getAuthenticatedRequestUser } from '@/lib/auth/session';

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = getAuthenticatedRequestUser(req);
  if (!user) {
    return NextResponse.json(
      { error: 'Login required', authRequired: true },
      { status: 401 },
    );
  }

  const { id } = await params;
  deleteChat(id, user.id);
  return NextResponse.json({ success: true });
}
