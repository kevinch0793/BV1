import { redirect } from "next/navigation";
import { getCurrentClient } from "@/lib/auth";
import { AuthForm } from "@/components/AuthForm";

export const dynamic = "force-dynamic";

export default async function RegisterPage() {
  if (await getCurrentClient()) redirect("/");
  return <AuthForm mode="register" />;
}
