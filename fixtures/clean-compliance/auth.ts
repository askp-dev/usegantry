import NextAuth from "next-auth";

// 15-minute idle limit, refreshed on activity.
export const { handlers, auth } = NextAuth({
  providers: [],
  session: { strategy: "jwt", maxAge: 15 * 60, updateAge: 60 },
});
