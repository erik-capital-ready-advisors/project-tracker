import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import { AppShell } from "@/components/app-shell";
import { ThemeProvider } from "@/components/theme-provider";
import { TooltipProvider } from "@/components/ui/tooltip";

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

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable}`}
    >
      <body>
        <ThemeProvider>
          <TooltipProvider>
            {/* DATA: `unparsedCount` is omitted, so the shell renders
                "unparsed count unavailable". It stays that way until the ingest
                schema (i1) and parsers (i2) exist. Passing 0 before then would
                assert that everything classified. */}
            <AppShell>{children}</AppShell>
          </TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
