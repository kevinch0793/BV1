"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { logout } from "@/app/actions/auth";

const items = [
  {
    href: "/",
    label: "Dashboard",
    icon: (
      <path d="M3 13h8V3H3v10Zm0 8h8v-6H3v6Zm10 0h8V11h-8v10Zm0-18v6h8V3h-8Z" />
    ),
  },
  {
    href: "/profiles",
    label: "Profiles",
    icon: <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M12 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0Zm10 14v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />,
  },
  {
    href: "/calendar",
    label: "Activity",
    icon: <path d="M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z" />,
  },
  {
    href: "/planner",
    label: "Planner",
    icon: <path d="M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2ZM9 16l2 2 4-4" />,
  },
  {
    href: "/insights",
    label: "Insights",
    icon: <path d="M3 3v18h18M7 14l3-4 4 3 5-7" />,
  },
  {
    href: "/search",
    label: "Search",
    icon: (
      <>
        <circle cx="11" cy="11" r="8" />
        <path d="m21 21-4.3-4.3" />
      </>
    ),
  },
  {
    href: "/settings",
    label: "Settings",
    icon: (
      <>
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
      </>
    ),
  },
];

const adminIcon = (
  <>
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M22 11l-3 3-1.5-1.5" />
  </>
);

export function Sidebar({ isAdmin, clientEmail }: { isAdmin: boolean; clientEmail: string }) {
  const pathname = usePathname();
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));
  const linkCls = (href: string) =>
    `flex items-center gap-2 rounded-md px-3 py-2 text-sm ${
      isActive(href) ? "bg-sky-50 font-medium text-sky-800" : "text-neutral-600 hover:bg-neutral-100"
    }`;

  return (
    <aside className="no-print flex flex-col border-b border-neutral-200 bg-white md:sticky md:top-0 md:h-screen md:w-56 md:shrink-0 md:self-start md:border-b-0 md:border-r">
      <div className="flex items-center gap-2 px-5 py-4 font-semibold text-neutral-900">
        <span className="grid h-7 w-7 place-items-center rounded-md bg-sky-700 text-sm text-white">R</span>
        Tailored Resume
      </div>
      <nav className="flex gap-1 px-3 pb-3 md:flex-col">
        {items.map((it) => (
          <Link key={it.href} href={it.href} className={linkCls(it.href)}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              {it.icon}
            </svg>
            {it.label}
          </Link>
        ))}

        {isAdmin && (
          <>
            <div className="mt-3 px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-neutral-400">Admin</div>
            <Link href="/admin/clients" className={linkCls("/admin/clients")}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                {adminIcon}
              </svg>
              Clients
            </Link>
          </>
        )}
      </nav>

      <div className="mt-auto border-t border-neutral-200 p-3 md:block">
        <div className="truncate px-2 pb-2 text-xs text-neutral-400" title={clientEmail}>{clientEmail}</div>
        <form action={logout}>
          <button className="w-full rounded-md px-3 py-2 text-left text-sm text-neutral-600 hover:bg-neutral-100">
            Sign out
          </button>
        </form>
      </div>
    </aside>
  );
}
