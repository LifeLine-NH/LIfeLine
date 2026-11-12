import Link from "next/link";
import { Suspense } from "react";
import { LogoMark } from "./Logo";
import { ModeBadges } from "./ModeBadges";
import { NAV } from "./nav";
import { NavLinks } from "./NavLinks";
import { WalletButton } from "./WalletButton";

function PlainNav() {
  return (
    <nav className="nav" aria-label="Main">
      {NAV.map((n) => (
        <Link key={n.href} href={n.href}>
          {n.label}
        </Link>
      ))}
    </nav>
  );
}

export function Header() {
  return (
    <header className="hdr ll">
      <div className="wrap hdr-in">
        <Link className="brand" href="/" aria-label="LifeLine home">
          <LogoMark />
          <span>LifeLine</span>
        </Link>
        <Suspense fallback={<PlainNav />}>
          <NavLinks />
        </Suspense>
        <div className="hdr-right">
          <ModeBadges className="modes-h hide-sm" />
          <WalletButton />
        </div>
        <ModeBadges className="show-sm modes-phone" />
      </div>
    </header>
  );
}
