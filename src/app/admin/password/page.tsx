import { requirePage } from "@/lib/page-guard";
import { PasswordForm } from "./password-form";

export const dynamic = "force-dynamic";

export default async function PasswordPage() {
  // ทุกบทบาทเปลี่ยนรหัสผ่านของตัวเองได้ แต่ต้องเข้าสู่ระบบก่อน
  await requirePage("SCORER");
  return <PasswordForm />;
}
