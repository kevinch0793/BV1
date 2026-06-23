import { redirect } from "next/navigation";
import { getCurrentClient } from "@/lib/auth";
import { AuthForm } from "@/components/AuthForm";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (await getCurrentClient()) redirect("/");
  return <AuthForm mode="login" />;
}
