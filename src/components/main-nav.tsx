"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";
import { ANSWER_ROUTES, OPERATOR_ROUTES, type NavItem } from "@/lib/nav";

function NavLink({ item }: { item: NavItem }) {
  const pathname = usePathname();
  const active = pathname === item.href || pathname.startsWith(`${item.href}/`);

  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      data-verify-unit="nav-link"
      data-verify-href={item.href}
      data-verify-active={active}
      className={cn(
        "flex items-center justify-between rounded-md px-2.5 py-1.5 text-sm transition-colors",
        active
          ? "bg-primary/10 text-primary font-medium"
          : "text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      <span>{item.label}</span>
    </Link>
  );
}

export function MainNav() {
  return (
    <nav aria-label="Primary" className="flex flex-col gap-6">
      <div className="flex flex-col gap-0.5">
        <h2 className="text-muted-foreground px-2.5 pb-1 text-[11px] font-medium tracking-wider uppercase">
          The six answers
        </h2>
        {ANSWER_ROUTES.map((item) => (
          <NavLink key={item.href} item={item} />
        ))}
      </div>

      <div className="flex flex-col gap-0.5">
        <h2 className="text-muted-foreground px-2.5 pb-1 text-[11px] font-medium tracking-wider uppercase">
          Records
        </h2>
        {OPERATOR_ROUTES.map((item) => (
          <NavLink key={item.href} item={item} />
        ))}
      </div>
    </nav>
  );
}
