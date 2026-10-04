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
    <nav className="fixed bottom-0 left-1/2 z-40 w-full max-w-lg -translate-x-1/2 border-t border-border bg-nav pb-[env(safe-area-inset-bottom)]">
      <ul className="grid grid-cols-5 items-end">
        {sideItems.slice(0, 2).map((item) => (
          <NavLink key={item.href} {...item} active={item.href === "/" ? pathname === "/" : pathname.startsWith(item.href)} />
        ))}
        <li className="flex justify-center pb-2">
          <button
            type="button"
            aria-label="Quick Entry"
            className="mb-1 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-2xl font-semibold text-on-primary"
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
          "flex min-h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium",
          active ? "text-foreground" : "text-muted",
        )}
      >
        <Icon size={22} strokeWidth={active ? 2.2 : 1.8} />
        {label}
      </Link>
    </li>
  );
}
