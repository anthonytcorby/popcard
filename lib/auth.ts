import { NextAuthOptions } from 'next-auth';
import { PrismaAdapter } from '@auth/prisma-adapter';
import EmailProvider from 'next-auth/providers/email';
import { Resend } from 'resend';
import { prisma } from '@/lib/prisma';

const ADMIN_EMAILS = ['anthonycorby@gmail.com'];

// Lazy-init to avoid build-time error when RESEND_API_KEY is not set
let _resend: Resend | null = null;
function getResend() {
  if (!_resend) _resend = new Resend(process.env.RESEND_API_KEY);
  return _resend;
}

function buildMagicLinkEmail(url: string): string {
  return `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f4f4f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f7;padding:40px 0;">
    <tr>
      <td align="center">
        <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.06);">

          <!-- Header with logo -->
          <tr>
            <td style="background: linear-gradient(135deg, #4A90D9 0%, #6366f1 100%); padding: 32px 40px; text-align: center;">
              <h1 style="margin:0;font-size:28px;font-weight:800;color:#ffffff;letter-spacing:-0.5px;">
                <span style="color:#FF6B6B;">P</span><span style="color:#FFD93D;">o</span><span style="color:#4ECDC4;">p</span><span style="color:#ffffff;">card</span><span style="color:#FF9A3C;">.</span>
              </h1>
              <p style="margin:8px 0 0;font-size:13px;color:rgba(255,255,255,0.8);font-weight:500;">Watch less. Know more.</p>
            </td>
          </tr>

          <!-- Main content -->
          <tr>
            <td style="padding:40px 40px 24px;">
              <h2 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#1a1a2e;">Your magic link is ready</h2>
              <p style="margin:0 0 28px;font-size:15px;color:#6b7280;line-height:1.6;">
                Click the button below to securely sign in to Popcard. This link expires in 24 hours.
              </p>

              <!-- CTA Button -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center">
                    <a href="${url}" style="display:inline-block;padding:14px 40px;background:linear-gradient(135deg,#4A90D9 0%,#6366f1 100%);color:#ffffff;text-decoration:none;border-radius:999px;font-weight:700;font-size:15px;letter-spacing:0.2px;">
                      Sign in to Popcard &rarr;
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Features section -->
          <tr>
            <td style="padding:8px 40px 32px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border-radius:12px;padding:20px 24px;">
                <tr>
                  <td style="padding:8px 0;">
                    <table role="presentation" cellpadding="0" cellspacing="0"><tr>
                      <td style="padding-right:12px;vertical-align:top;font-size:16px;">&#9889;</td>
                      <td><span style="font-size:13px;color:#374151;font-weight:600;">AI-Powered Extraction</span><br><span style="font-size:12px;color:#9ca3af;">Turn videos, PDFs &amp; articles into knowledge cards</span></td>
                    </tr></table>
                  </td>
                </tr>
                <tr>
                  <td style="padding:8px 0;">
                    <table role="presentation" cellpadding="0" cellspacing="0"><tr>
                      <td style="padding-right:12px;vertical-align:top;font-size:16px;">&#127775;</td>
                      <td><span style="font-size:13px;color:#374151;font-weight:600;">Smart Summaries</span><br><span style="font-size:12px;color:#9ca3af;">Key insights, quotes, stats &amp; takeaways in seconds</span></td>
                    </tr></table>
                  </td>
                </tr>
                <tr>
                  <td style="padding:8px 0;">
                    <table role="presentation" cellpadding="0" cellspacing="0"><tr>
                      <td style="padding-right:12px;vertical-align:top;font-size:16px;">&#128640;</td>
                      <td><span style="font-size:13px;color:#374151;font-weight:600;">Export Anywhere</span><br><span style="font-size:12px;color:#9ca3af;">Share cards as images, copy text, or save for later</span></td>
                    </tr></table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Divider -->
          <tr>
            <td style="padding:0 40px;">
              <hr style="border:none;border-top:1px solid #e5e7eb;margin:0;" />
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:24px 40px 32px;text-align:center;">
              <p style="margin:0 0 12px;font-size:12px;color:#9ca3af;line-height:1.5;">
                If you didn't request this email, you can safely ignore it.<br>
                This link can only be used once and expires in 24 hours.
              </p>
              <p style="margin:0;font-size:11px;color:#c4c7cc;line-height:1.5;">
                &copy; 2026 Popcard AI. All rights reserved.<br>
                <a href="https://popcard.me" style="color:#9ca3af;text-decoration:none;">popcard.me</a>
                &nbsp;&middot;&nbsp;
                <a href="https://popcard.me/#" style="color:#9ca3af;text-decoration:none;">Privacy Policy</a>
                &nbsp;&middot;&nbsp;
                <a href="https://popcard.me/#" style="color:#9ca3af;text-decoration:none;">Terms of Service</a>
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma) as NextAuthOptions['adapter'],
  providers: [
    EmailProvider({
      from: process.env.EMAIL_FROM ?? 'noreply@popcard.me',
      sendVerificationRequest: async ({ identifier: email, url }) => {
        const result = await getResend().emails.send({
          from: process.env.EMAIL_FROM ?? 'noreply@popcard.me',
          to: email,
          subject: 'Sign in to Popcard',
          html: buildMagicLinkEmail(url),
        });
        if (result.error) {
          throw new Error(`Failed to send verification email: ${result.error.message}`);
        }
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

        // Admin gets unlimited access
        if (ADMIN_EMAILS.includes(dbUser.email ?? '')) {
          session.user.subscriptionStatus = 'active';
          session.user.subscriptionEnd = null;
        } else {
          session.user.subscriptionStatus = dbUser.subscription?.status ?? null;
          session.user.subscriptionEnd = dbUser.subscription?.currentPeriodEnd?.toISOString() ?? null;
        }
      }

      return session;
    },
  },
};

export { ADMIN_EMAILS };
