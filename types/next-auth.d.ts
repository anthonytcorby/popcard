import 'next-auth';

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      email: string;
      name?: string | null;
      image?: string | null;
      extractionCount: number;
      subscriptionStatus: string | null;
      subscriptionEnd: string | null;
    };
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    userId: string;
  }
}
