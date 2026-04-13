import { NextAuthOptions } from 'next-auth';
import { PrismaAdapter } from '@auth/prisma-adapter';
import EmailProvider from 'next-auth/providers/email';
import { Resend } from 'resend';
import { prisma } from '@/lib/prisma';

const resend = new Resend(process.env.RESEND_API_KEY);

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma) as NextAuthOptions['adapter'],
  providers: [
    EmailProvider({
      from: process.env.EMAIL_FROM ?? 'noreply@popcard.app',
      sendVerificationRequest: async ({ identifier: email, url }) => {
        await resend.emails.send({
          from: process.env.EMAIL_FROM ?? 'noreply@popcard.app',
          to: email,
          subject: 'Sign in to Popcard',
          html: `
            <div style="font-family: sans-serif; max-width: 400px; margin: 0 auto; text-align: center;">
              <h2 style="color: #4A90D9;">Popcard</h2>
              <p>Click the button below to sign in:</p>
              <a href="${url}" style="display: inline-block; padding: 12px 32px; background: #4A90D9; color: white; text-decoration: none; border-radius: 999px; font-weight: 600;">
                Sign in to Popcard
              </a>
              <p style="color: #999; font-size: 12px; margin-top: 24px;">
                If you didn't request this, you can safely ignore this email.
              </p>
            </div>
          `,
        });
      },
    }),
  ],
  session: {
    strategy: 'jwt',
  },
  pages: {
    signIn: '/',
    verifyRequest: '/',
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.userId = user.id;
      }
      return token;
    },
    async session({ session, token }) {
      const userId = token.userId as string;
      const dbUser = await prisma.user.findUnique({
        where: { id: userId },
        include: { subscription: true },
      });

      if (dbUser) {
        session.user.id = dbUser.id;
        session.user.email = dbUser.email ?? '';
        session.user.extractionCount = dbUser.extractionCount;
        session.user.subscriptionStatus = dbUser.subscription?.status ?? null;
        session.user.subscriptionEnd = dbUser.subscription?.currentPeriodEnd?.toISOString() ?? null;
      }

      return session;
    },
  },
};
