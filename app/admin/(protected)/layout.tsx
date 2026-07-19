import Link from "next/link";
import LogoutButton from "@/components/LogoutButton";
import Footer from "@/components/Footer";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1 min-h-0 flex-col">
      <nav className="flex items-center gap-4 px-4 py-2 border-b border-[var(--border)] text-sm">
        <span className="flex items-center gap-1.5 font-semibold mr-2">
          <img src="/aspen.png" alt="" className="h-5 w-5" />
          Pando
        </span>
        <Link href="/admin/campaigns">Campaigns</Link>
        <Link href="/admin/templates">Templates</Link>
        <Link href="/admin/subscribers">Subscribers</Link>
        <Link href="/admin/images">Images</Link>
        <Link href="/admin/settings">Settings</Link>
        <span className="flex-1" />
        <LogoutButton />
      </nav>
      <div className="flex-1 min-h-0 flex flex-col">{children}</div>
      <Footer />
    </div>
  );
}
