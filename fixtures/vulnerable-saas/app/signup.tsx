"use client";
export function SignupForm() {
  return (
    <form action="/api/signup" method="post">
      <label htmlFor="email">Email</label>
      <input id="email" name="email" type="email" />
      <input type="checkbox" name="terms" defaultChecked /> I agree
      <button type="submit">Sign up</button>
    </form>
  );
}
