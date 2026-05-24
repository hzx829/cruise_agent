import { deleteChat } from '@/lib/db/chat-store';
import { NextResponse } from 'next/server';
import { applySessionCookie, ensureRequestUser } from '@/lib/auth/session';

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = ensureRequestUser(req);
  const { id } = await params;
  deleteChat(id, auth.user.id);
  const response = NextResponse.json({ success: true });
  applySessionCookie(response, auth);
  return response;
}
