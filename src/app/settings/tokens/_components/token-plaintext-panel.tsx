"use client";

import { useState } from "react";
import { Check, Copy, TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * The one moment an agent token's plaintext exists outside the database.
 *
 * §7a: `agent_token` is `sensitive`, "hashed with pgcrypto `crypt()`; **the
 * plaintext token is shown once at creation and never stored**". There is no
 * lookup. If it is lost here, the only remedy is to rotate.
 *
 * ## What this component does to make "once" obvious rather than merely true
 *
 * The technical fact -- that nothing can show it again -- is useless if the
 * operator dismisses the panel before reading it. So the dismissal is
 * deliberately harder than the default:
 *
 *   * **no close X**, so there is no one-pixel target that discards a credential;
 *   * **Escape does not close it**, and neither does a click outside;
 *   * the only way out is the acknowledgement button, whose label says what
 *     acknowledging means.
 *
 * That is three unusual choices in a row, and each is here because the cost of
 * an accidental dismissal is a rotation plus whatever broke in between.
 *
 * ## What is NOT done with the value
 *
 *   * It is never written to a `data-verify-*` attribute. The state contract
 *     carries `data-verify-shown` and the token **id**, which `i4` establishes is
 *     not the secret; the secret itself appears only as text in the panel body.
 *     A test asserting on this component asserts that a token was shown, never
 *     which one.
 *   * It is never put in the URL, in `localStorage`, or in any prop that
 *     survives dismissal -- the parent holds it in `useState` and clears it.
 *   * It is never logged.
 *   * It is never rendered into a Playwright snapshot or a fixture. A test that
 *     needs one generates a value of the right *shape*.
 */
export function TokenPlaintextPanel({
  tokenId,
  label,
  plaintext,
  rotated,
  onDismiss,
}: {
  tokenId: string;
  label: string;
  /** Shown once. Held by the caller in component state and cleared on dismiss. */
  plaintext: string;
  /** True when this replaced an existing token, so the copy can say so. */
  rotated: boolean;
  onDismiss: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);

  async function copy() {
    setCopyFailed(false);
    try {
      await navigator.clipboard.writeText(plaintext);
      setCopied(true);
    } catch {
      // A clipboard write can be refused by permissions or unavailable over a
      // non-secure origin. Saying so beats a button that silently does nothing,
      // and the value is selectable in the panel either way.
      setCopyFailed(true);
    }
  }

  return (
    <Dialog open onOpenChange={() => undefined}>
      <DialogContent
        showCloseButton={false}
        onEscapeKeyDown={(event) => event.preventDefault()}
        onPointerDownOutside={(event) => event.preventDefault()}
        onInteractOutside={(event) => event.preventDefault()}
        data-verify-unit="token-plaintext"
        data-verify-shown="true"
        data-verify-token-id={tokenId}
        data-verify-rotated={rotated ? "true" : "false"}
        className="sm:max-w-lg"
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <TriangleAlert aria-hidden className="text-state-carried size-4" />
            {/* COPY: the once-only reveal title */}
            {rotated ? "Replacement token" : "New token"} — shown once
          </DialogTitle>
          <DialogDescription>
            {/* COPY: the once-only reveal description */}
            Copy it now. Only a hash of this value is stored, so nothing — not
            this screen, not the database, not support — can show it again. If it
            is lost, rotate the token.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2">
          <p className="text-muted-foreground text-xs">
            <span className="ident text-foreground">{label}</span>
          </p>

          <code
            data-verify-unit="token-plaintext-value"
            className="border-border bg-muted/60 text-foreground block rounded-lg border px-3 py-2 text-xs break-all select-all"
          >
            {plaintext}
          </code>

          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={copy}>
              {copied ? (
                <Check aria-hidden className="size-3.5" />
              ) : (
                <Copy aria-hidden className="size-3.5" />
              )}
              {/* COPY: copy button, and its copied state */}
              {copied ? "Copied" : "Copy"}
            </Button>
            {copyFailed ? (
              <p
                role="alert"
                data-verify-unit="token-copy-failed"
                className="text-state-blocked text-xs"
              >
                {/* COPY: shown when the clipboard write was refused */}
                The clipboard was not available. Select the value above and copy
                it by hand.
              </p>
            ) : null}
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            size="sm"
            onClick={onDismiss}
            data-verify-unit="token-plaintext-dismiss"
          >
            {/* COPY: the acknowledgement that dismisses the once-only reveal */}
            I have stored it — close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
