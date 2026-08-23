"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";
import type { ComponentProps } from "react";

/**
 * Spec 5a: "Both light and dark themes are first-class." `defaultTheme="system"`
 * honours the operator's OS setting rather than picking one for him.
 *
 * `disableTransitionOnChange` matters here for the same reason 5a asks for
 * minimal motion -- a full-page colour transition on every theme switch is an
 * entrance animation by another name.
 */
export function ThemeProvider({
  children,
  ...props
}: ComponentProps<typeof NextThemesProvider>) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
      {...props}
    >
      {children}
    </NextThemesProvider>
  );
}
