"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV } from "./nav";

export function NavLinks() {
  const path = usePathname() ?? "/";
  return (
    <nav className="nav" aria-label="Main">
      {NAV.map((n) => {
        const on = path === n.href || path.startsWith(`${n.href}/`);
        return (
          <Link key={n.href} href={n.href} className={on ? "on" : ""} aria-current={on ? "page" : undefined}>
            {n.label}
          </Link>
        );
      })}
    </nav>
  );
}
