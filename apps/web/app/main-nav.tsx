"use client";

import type { CSSProperties } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { href: "/", label: "Today" },
  { href: "/upcoming", label: "Upcoming" },
  { href: "/history", label: "History" },
  { href: "/review", label: "Review" },
  { href: "/settings", label: "Settings" },
] as const;

const styles: Record<string, CSSProperties> = {
  nav: {
    display: "flex",
    alignItems: "baseline",
    gap: 18,
    marginTop: -12,
  },
  brand: {
    fontSize: 15,
    fontWeight: 600,
    letterSpacing: "-0.02em",
    color: "var(--text)",
    marginRight: 6,
    userSelect: "none",
  },
  active: { fontSize: 13, color: "var(--text)", textDecoration: "none" },
  link: { fontSize: 13, color: "var(--subtle)", textDecoration: "none" },
};

/**
 * Shared signed-in navigation. Single source of truth for the link set/order
 * (Today | Upcoming | History | Settings), replacing the per-page copies. The
 * current page gets the same subtle active treatment as before (text color).
 */
export default function MainNav() {
  const pathname = usePathname();

  return (
    <nav style={styles.nav}>
      <span style={styles.brand}>Rhythm</span>
      {NAV_ITEMS.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className="nav-link"
          style={pathname === item.href ? styles.active : styles.link}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
