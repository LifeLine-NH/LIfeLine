import Link from "next/link";
import { ModeBadges } from "./ModeBadges";

const links = [
  { href: "/cases", label: "Cases" },
  { href: "/donate", label: "Donate" },
  { href: "/ngo", label: "For NGOs" },
  { href: "/ops", label: "Ops" },
];

export function SiteHeader() {
  return (
    <header className="bg-tarp text-white">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-8 gap-y-3 px-4 py-4 sm:px-6">
        <Link href="/" className="font-display text-3xl font-extrabold tracking-wide">
          LifeLine
        </Link>
        <nav className="flex flex-1 flex-wrap gap-x-5 gap-y-1 text-sm font-medium">
          {links.map((l) => (
            <Link key={l.href} href={l.href} className="text-white/85 underline-offset-4 hover:text-white hover:underline">
              {l.label}
            </Link>
          ))}
        </nav>
        <ModeBadges />
      </div>
    </header>
  );
}
