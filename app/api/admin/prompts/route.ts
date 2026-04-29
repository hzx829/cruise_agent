import { NextResponse } from 'next/server';
import { isAdminAuthEnabled, requireAdmin } from '@/lib/admin-auth';
import { listPrompts, savePromptDraft } from '@/lib/ai/prompt-store';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const authError = requireAdmin(req);
  if (authError) return authError;

  return NextResponse.json({
    ...listPrompts(),
    authRequired: isAdminAuthEnabled(),
  });
}

export async function POST(req: Request) {
  const authError = requireAdmin(req);
  if (authError) return authError;

  try {
    const body = await req.json();
    const prompt = savePromptDraft({
      content: String(body.content ?? ''),
      changeNote: body.changeNote ? String(body.changeNote) : null,
      createdBy: body.createdBy ? String(body.createdBy) : 'product',
    });

    return NextResponse.json({ prompt });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to save prompt draft.' },
      { status: 400 },
    );
  }
}
