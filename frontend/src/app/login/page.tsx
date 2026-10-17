import { AuthForm } from "@/components/auth/auth-form";

export const metadata = { title: "Log in — AgentCart" };

export default function LoginPage() {
  return (
    <div className="flex items-center justify-center py-16">
      <AuthForm mode="login" />
    </div>
  );
}