"use client";

import { Menu } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { MainNav } from "@/components/main-nav";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

/**
 * The sidebar rail is hidden below `md`, so without this the six answers are
 * unreachable on a phone. Closes on navigation -- a drawer left open over the
 * screen the user just asked for is the classic version of this bug.
 */
export function MobileNav() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => setOpen(false), [pathname]);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="md:hidden"
          aria-label="Open navigation"
          data-verify-unit="mobile-nav-trigger"
        >
          <Menu className="size-4" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-64 px-3 py-4">
        <SheetHeader className="px-2.5 pb-2">
          <SheetTitle className="text-sm">Delivery Ledger</SheetTitle>
        </SheetHeader>
        <MainNav />
      </SheetContent>
    </Sheet>
  );
}
