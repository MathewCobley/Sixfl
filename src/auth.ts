// ========================================
// File: src/auth.ts
// ========================================

import type { NextAuthOptions } from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import EmailProvider from "next-auth/providers/email";
import { Resend } from "resend";
import { prisma } from "@/lib/prisma";

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),

  providers: [
    EmailProvider({
      async sendVerificationRequest({ identifier, url, provider }) {
        const email = identifier.toLowerCase().trim();

        const existingUser = await prisma.user.findUnique({
          where: { email },
        });

        if (!existingUser) {
          return;
        }

        const resend = new Resend(process.env.RESEND_API_KEY);

        const from = provider.from ?? process.env.EMAIL_FROM!;
        const to = email;
        const subject = "Your SIXFL sign-in link";

        const html = `
          <div style="font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial;">
            <h2>SIXFL</h2>
            <p>Click to sign in:</p>
            <p><a href="${url}">${url}</a></p>
            <p style="color:#666;font-size:12px;">
              If you didn’t request this, you can ignore this email.
            </p>
          </div>
        `;

        await resend.emails.send({
          from,
          to,
          subject,
          html,
        });
      },
      from: process.env.EMAIL_FROM!,
    }),
  ],

  session: { strategy: "database" },
  secret: process.env.NEXTAUTH_SECRET,
  pages: {
    signIn: "/login",
    verifyRequest: "/auth/verify-request",
    error: "/login",
  },
  debug: process.env.NEXTAUTH_DEBUG === "true",

  callbacks: {
    async signIn({ user, account }) {
      if (account?.provider === "email") {
        const email = user.email?.toLowerCase().trim();

        if (!email) {
          return false;
        }

        const existingUser = await prisma.user.findUnique({
          where: { email },
        });

        if (!existingUser) {
          return false;
        }
      }

      return true;
    },

    async session({ session, user }) {
      if (session.user) {
        (session.user as typeof session.user & { id: string }).id = user.id;
      }

      return session;
    },
  },
};