"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Home, Receipt, Users, BarChart3 } from "lucide-react";
import { cn } from "@/lib/utils";

const sideItems = [
  { href: "/", label: "Home", icon: Home },
  { href: "/clients", label: "Clients", icon: Users },
  { href: "/expenses", label: "Expenses", icon: Receipt },
  { href: "/reports", label: "Reports", icon: BarChart3 },
];

export function BottomNav() {
  const pathname = usePathname();
  const router = useRouter();

  return (
    <nav className="kh-tabbar" aria-label="Primary">
      <ul className="grid grid-cols-5 items-end px-1 pb-1 pt-1">
        {sideItems.slice(0, 2).map((item) => (
          <NavLink key={item.href} {...item} active={item.href === "/" ? pathname === "/" : pathname.startsWith(item.href)} />
        ))}
        <li className="flex justify-center">
          <button
            type="button"
            aria-label="Quick Entry"
            className="kh-plus kh-press"
            onClick={() => {
              if (pathname !== "/") router.push("/?entry=1");
              window.dispatchEvent(new Event("focus-quick-entry"));
            }}
          >
            +
          </button>
        </li>
        {sideItems.slice(2).map((item) => (
          <NavLink key={item.href} {...item} active={pathname.startsWith(item.href)} />
        ))}
      </ul>
    </nav>
  );
}

function NavLink({
  href,
  label,
  icon: Icon,
  active,
}: {
  href: string;
  label: string;
  icon: typeof Home;
  active: boolean;
}) {
  return (
    <li>
      <Link
        href={href}
        className={cn(
          "flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium",
          active ? "kh-nav-active" : "text-muted",
        )}
      >
        <Icon size={20} strokeWidth={active ? 2.3 : 1.8} />
        {active ? <span className="kh-nav-light" /> : <span className="h-0.5" />}
        {label}
      </Link>
    </li>
  );
}
