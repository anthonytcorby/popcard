import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

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

  // Read fresh from DB to avoid stale JWT data
  const dbUser = await prisma.user.findUnique({
    where: { id: session.user.id },
    include: { subscription: true },
  });

  if (!dbUser) {
    return Response.json({ error: 'user_not_found' }, { status: 404 });
  }

  const isSubscribed =
    dbUser.subscription?.status === 'active' ||
    dbUser.subscription?.status === 'past_due';

  if (!isSubscribed && dbUser.extractionCount >= FREE_LIMIT) {
    return Response.json({ error: 'limit_reached', canExtract: false }, { status: 403 });
  }

  if (!isSubscribed) {
    // Atomic increment with guard to prevent race conditions
    const result = await prisma.user.updateMany({
      where: { id: session.user.id, extractionCount: { lt: FREE_LIMIT } },
      data: { extractionCount: { increment: 1 } },
    });

    if (result.count === 0) {
      return Response.json({ error: 'limit_reached', canExtract: false }, { status: 403 });
    }
  }

  return Response.json({ ok: true });
}
