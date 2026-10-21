import NextAuth from "next-auth";

// HIPAA-03: a 30-day session on a PHI app (idle limit is 15 minutes).
export const { handlers, auth } = NextAuth({
  providers: [],
  session: { strategy: "jwt", maxAge: 30 * 24 * 60 * 60 },
});
