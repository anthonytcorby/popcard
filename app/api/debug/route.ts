import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
  const results: Record<string, string> = {};

  // Test 1: Check DATABASE_URL is set
  results.hasDbUrl = process.env.DATABASE_URL ? 'yes' : 'NO - MISSING';

  // Test 2: Try Prisma connection
  try {
    const count = await prisma.user.count();
    results.prismaConnection = `OK - ${count} users`;
  } catch (e: unknown) {
    results.prismaConnection = `FAILED: ${e instanceof Error ? e.message : String(e)}`;
  }

  // Test 3: Check Resend key
  results.hasResendKey = process.env.RESEND_API_KEY ? 'yes' : 'NO - MISSING';
  results.emailFrom = process.env.EMAIL_FROM ?? 'NOT SET';

  // Test 4: Try creating and deleting a verification token
  try {
    const token = await prisma.verificationToken.create({
      data: {
        identifier: 'debug-test@test.com',
        token: 'debug-test-token-' + Date.now(),
        expires: new Date(Date.now() + 60000),
      },
    });
    await prisma.verificationToken.delete({
      where: {
        identifier_token: {
          identifier: token.identifier,
          token: token.token,
        },
      },
    });
    results.verificationTokenTest = 'OK - create/delete works';
  } catch (e: unknown) {
    results.verificationTokenTest = `FAILED: ${e instanceof Error ? e.message : String(e)}`;
  }

  return Response.json(results);
}
