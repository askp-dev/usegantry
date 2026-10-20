import { acceptTerms } from "@/app/actions";

export default function SignupPage() {
  return (
    <form action={acceptTerms}>
      <label htmlFor="email">Email</label>
      <input id="email" name="email" type="email" required />
      <label>
        <input type="checkbox" name="acceptTerms" required /> I agree to the <a href="/terms">Terms</a> and <a href="/privacy">Privacy Policy</a>
      </label>
      <button type="submit">Sign up</button>
    </form>
  );
}
