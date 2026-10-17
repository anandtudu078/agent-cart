import { AuthForm } from "@/components/auth/auth-form";

export const metadata = { title: "Sign up — AgentCart" };

export default function SignupPage() {
  return (
    <div className="flex items-center justify-center py-16">
      <AuthForm mode="signup" />
    </div>
  );
}