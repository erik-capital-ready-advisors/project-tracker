import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { headers } from "next/headers";

import { AppShell } from "@/components/app-shell";
import { ThemeProvider } from "@/components/theme-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { readUnparsedCensus } from "@/lib/unparsed-census";

import "./globals.css";

/**
 * Spec 5a: "One sans for the interface and one monospace for identifiers,
 * durations and status tokens."
 *
 * The `--font-*` variables are declared on <html> rather than <body>, and the
 * families are ALSO written literally into `@theme inline` in globals.css --
 * Tailwind v4 resolves that block at parse time and cannot see a variable
 * next/font injects at runtime, so the literal names are what actually apply
 * the font and these variables are what supply the hashed local files.
 */
const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Delivery Ledger",
  // COPY: product description used as the meta description
  description:
    "What is blocked, what is next, what was committed, what is untested, what is broken, and what Erik is the bottleneck on.",
};

/**
 * Reading `headers()` is what makes every route dynamic, and that is required
 * rather than incidental: the Content-Security-Policy set in `proxy.ts` carries
 * a per-request nonce, and Next can only stamp that nonce onto its script tags
 * during a server render. A statically prerendered page was built when no
 * request existed, so its scripts would carry no nonce and the policy would
 * block them. §7a states this product has no public surface and every screen
 * reads live per-request data, so nothing here wanted prerendering anyway.
 *
 * The nonce is then handed to `next-themes`, whose pre-paint theme script is the
 * one inline script Next does not stamp itself. Without it that script is
 * blocked and the operator gets a flash of the wrong theme on every load.
 *
 * (Both changes are work-unit i4's, in a UI-owned file. They are mechanical —
 * no markup, layout or styling was altered.)
 */
export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const nonce = (await headers()).get("x-nonce") ?? undefined;

  /*
   * FR-58's count, filling the DATA slot u1 left on `AppShell`.
   *
   * u1 wrote: "wire to the live unparsed count once the ingest tables exist
   * (work-unit i1 for schema, i2 for the parsers)". Both have landed and i7 has
   * since defined the single population, so the precondition is met and the
   * badge no longer has to read "unavailable" forever.
   *
   * Three properties are load-bearing, and all three live in
   * `@/lib/unparsed-census` rather than here:
   *
   *   * it is memoised per request, so this badge and the breakdown each of the
   *     six answer screens renders cannot show two different numbers;
   *   * a caller who is not a role-holding operator at aal2 gets an uncounted
   *     census, so an anonymous visitor on /sign-in learns nothing;
   *   * **every failure yields `null`, never `0`.** That is why this call cannot
   *     take the application down and why the badge cannot claim a clean ledger
   *     it never counted.
   */
  const census = await readUnparsedCensus();

  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable}`}
    >
      <body>
        <ThemeProvider nonce={nonce}>
          <TooltipProvider>
            <AppShell unparsedCount={census.total}>{children}</AppShell>
          </TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
