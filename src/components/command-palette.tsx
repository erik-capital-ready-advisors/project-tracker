"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { ANSWER_ROUTES, OPERATOR_ROUTES } from "@/lib/nav";

/**
 * Spec 5a names Linear's keyboard-first speed as a reference point, so the
 * palette is the primary way to move around and the sidebar is the discoverable
 * fallback rather than the other way round.
 *
 * Cmd+K / Ctrl+K opens it. The trigger in the header carries the same shortcut
 * as a visible hint, because a keyboard-only affordance nobody can see is a
 * feature only its author uses.
 */
export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setOpen((value) => !value);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    const onOpenRequest = () => setOpen(true);
    window.addEventListener("delivery-ledger:open-palette", onOpenRequest);
    return () =>
      window.removeEventListener("delivery-ledger:open-palette", onOpenRequest);
  }, []);

  const go = useCallback(
    (href: string) => {
      setOpen(false);
      router.push(href);
    },
    [router],
  );

  return (
    <CommandDialog
      open={open}
      onOpenChange={setOpen}
      title="Command palette"
      description="Jump to any screen."
    >
      <CommandInput placeholder="Jump to..." />
      <CommandList data-verify-unit="command-palette">
        <CommandEmpty>No matching screen.</CommandEmpty>
        <CommandGroup heading="The six answers">
          {ANSWER_ROUTES.map((item) => (
            <CommandItem
              key={item.href}
              value={`${item.label} ${item.question}`}
              onSelect={() => go(item.href)}
            >
              <span>{item.label}</span>
              <span className="text-muted-foreground ml-auto truncate text-xs">
                {item.href}
              </span>
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Records">
          {OPERATOR_ROUTES.map((item) => (
            <CommandItem
              key={item.href}
              value={`${item.label} ${item.question}`}
              onSelect={() => go(item.href)}
            >
              <span>{item.label}</span>
              <span className="text-muted-foreground ml-auto truncate text-xs">
                {item.href}
              </span>
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}

/** Header button that opens the palette, so the shortcut is discoverable. */
export function CommandPaletteTrigger() {
  return (
    <button
      type="button"
      data-verify-unit="command-palette-trigger"
      onClick={() =>
        window.dispatchEvent(new Event("delivery-ledger:open-palette"))
      }
      className="text-muted-foreground hover:border-ring/50 hover:text-foreground border-border bg-muted/40 inline-flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-xs transition-colors"
    >
      <span>Jump to...</span>
      <kbd className="ident border-border bg-background rounded border px-1.5 py-0.5 text-[10px]">
        ⌘K
      </kbd>
    </button>
  );
}
