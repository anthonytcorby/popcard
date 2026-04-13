import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

const FREE_LIMIT = 3;

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }

  return Response.json({
    extractionCount: session.user.extractionCount,
    subscriptionStatus: session.user.subscriptionStatus,
    remaining: Math.max(0, FREE_LIMIT - session.user.extractionCount),
    canExtract:
      session.user.subscriptionStatus === 'active' ||
      session.user.subscriptionStatus === 'past_due' ||
      session.user.extractionCount < FREE_LIMIT,
  });
}

export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }

  const isSubscribed =
    session.user.subscriptionStatus === 'active' ||
    session.user.subscriptionStatus === 'past_due';

  if (!isSubscribed && session.user.extractionCount >= FREE_LIMIT) {
    return Response.json({ error: 'limit_reached', canExtract: false }, { status: 403 });
  }

  if (!isSubscribed) {
    await prisma.user.update({
      where: { id: session.user.id },
      data: { extractionCount: { increment: 1 } },
    });
  }

  return Response.json({ ok: true });
}
