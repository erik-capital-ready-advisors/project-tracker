"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import type { ActionResult } from "@/lib/action-result";
import { ANSWER_READ, INGEST_WRITE } from "@/lib/api/capabilities";
import type { WireCapability } from "@/lib/api/capabilities";
import { Field } from "@/components/native-select";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { isoDay, isoMinute } from "@/lib/display-format";
import { cn } from "@/lib/utils";

import type { TokenStatus, TokenView } from "../_lib/status";
import { TokenPlaintextPanel } from "./token-plaintext-panel";

/**
 * FR-4 and FR-7 -- the agent-token interface.
 *
 * `i4` built `issueAgentToken`, `revokeAgentToken`, `rotateAgentToken` and
 * `listAgentTokens` and reported FR-7 **PARTIAL**: "the mechanism exists, the
 * interface does not." This component is that interface, and FR-7's words are
 * "revocable and rotatable **from the interface without a deploy**" -- so both
 * controls are on every row that can take them, not behind a CLI.
 *
 * ## What is on screen and what deliberately is not
 *
 * On screen: the label, the capability set, the status, the expiry, the last use
 * and the creation date. **Not** on screen, and not obtainable from it: the
 * token value. `listAgentTokens` selects a column list without `token_hash`, and
 * the plaintext is not in the database at all. The only moment a value exists
 * outside the database is the once-only panel, which the parent state clears on
 * dismissal.
 *
 * ## The actions arrive as props
 *
 * `onIssue`, `onRevoke` and `onRotate` are passed in rather than imported. That
 * is what makes the whole lifecycle -- issue, see the plaintext once, dismiss it,
 * revoke, rotate -- exercisable in a unit test with plain async functions in
 * those slots, with no database, no operator session, and no real credential
 * anywhere near the test.
 *
 * ## Status is data, not a computation
 *
 * `status` is derived on the server by `tokenStatus`. Recomputing it here would
 * mean the server and the browser could disagree, across a hydration boundary,
 * about whether a credential is currently valid.
 */

const CAPABILITY_HINT: Record<WireCapability, string> = {
  // COPY: what each capability lets an agent do
  [ANSWER_READ]: "read the six answer endpoints",
  [INGEST_WRITE]: "post artifacts, sessions and waits",
};

/**
 * The neutral ladder again, and for the same reason it is used for work status.
 *
 * A token being `active` is not the semantic scale's `verified`, and a `revoked`
 * one is not its `blocked`. Spec 5a requires each state colour to mean the same
 * thing on every surface, so borrowing one here would make it mean two things.
 * These are distinguished by fill and border treatment instead, which survives
 * greyscale and a colour-blind reader.
 */
const STATUS_CLASS: Record<TokenStatus, string> = {
  active: "border-foreground/40 bg-foreground/10 text-foreground font-medium",
  expired: "border-border text-muted-foreground border-dashed",
  revoked: "border-border text-muted-foreground/80 line-through",
};

function TokenStatusChip({ status }: { status: TokenStatus }) {
  return (
    <span
      data-verify-unit="token-status"
      data-verify-status={status}
      className={cn(
        "ident inline-flex shrink-0 items-center rounded-md border px-1.5 py-0.5 text-xs leading-none whitespace-nowrap",
        STATUS_CLASS[status],
      )}
    >
      {status}
    </span>
  );
}

interface Reveal {
  tokenId: string;
  label: string;
  plaintext: string;
  rotated: boolean;
}

export function TokenManager({
  tokens,
  defaultExpiryDay,
  onIssue,
  onRevoke,
  onRotate,
}: {
  tokens: readonly TokenView[];
  /** Computed on the server so the prefilled date is the same in both renders. */
  defaultExpiryDay: string;
  onIssue: (
    label: string,
    capabilities: string[],
    expiryDay: string,
  ) => Promise<ActionResult<{ id: string; label: string; plaintext: string }>>;
  onRevoke: (tokenId: string) => Promise<ActionResult<{ revoked: boolean }>>;
  onRotate: (
    tokenId: string,
    expiryDay: string,
  ) => Promise<ActionResult<{ id: string; label: string; plaintext: string }>>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [reveal, setReveal] = useState<Reveal | null>(null);
  const [issueOpen, setIssueOpen] = useState(false);
  const [issueError, setIssueError] = useState<string | null>(null);
  const [rotating, setRotating] = useState<TokenView | null>(null);
  const [revoking, setRevoking] = useState<TokenView | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  function issue(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const label = String(form.get("label") ?? "").trim();
    const expiry = String(form.get("expiresOn") ?? "").trim();
    const capabilities = form.getAll("capabilities").map(String);

    setIssueError(null);
    startTransition(async () => {
      const result = await onIssue(label, capabilities, expiry);
      if (!result.ok) {
        setIssueError(result.message);
        return;
      }
      setIssueOpen(false);
      setReveal({
        tokenId: result.data.id,
        label: result.data.label,
        plaintext: result.data.plaintext,
        rotated: false,
      });
      router.refresh();
    });
  }

  function rotate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const token = rotating;
    if (token === null) return;
    const expiry = String(
      new FormData(event.currentTarget).get("expiresOn") ?? "",
    ).trim();

    setRowError(null);
    startTransition(async () => {
      const result = await onRotate(token.id, expiry);
      if (!result.ok) {
        setRowError(result.message);
        return;
      }
      setRotating(null);
      setReveal({
        tokenId: result.data.id,
        label: result.data.label,
        plaintext: result.data.plaintext,
        rotated: true,
      });
      router.refresh();
    });
  }

  function revoke() {
    const token = revoking;
    if (token === null) return;

    setRowError(null);
    setNotice(null);
    startTransition(async () => {
      const result = await onRevoke(token.id);
      if (!result.ok) {
        setRowError(result.message);
        return;
      }
      setRevoking(null);
      // `revoked: false` means it was already revoked. That is success, and
      // saying so beats implying this click did something it did not.
      setNotice(
        result.data.revoked
          ? // COPY: confirmation that a token was revoked
            `Revoked “${token.label}”. Any agent still presenting it is refused from now on.`
          : // COPY: confirmation that a token was already revoked
            `“${token.label}” was already revoked. Nothing changed.`,
      );
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-3" data-verify-unit="token-manager">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p
          className="text-muted-foreground text-xs"
          data-verify-unit="token-count"
          data-verify-count={tokens.length}
        >
          {/* COPY: the token count line */}
          <span className="ident">{tokens.length}</span>
          {tokens.length === 1 ? " token" : " tokens"}
        </p>

        <Dialog open={issueOpen} onOpenChange={setIssueOpen}>
          <DialogTrigger asChild>
            <Button size="sm" data-verify-unit="issue-token-trigger">
              {/* COPY: the button that opens the issue-token form */}
              Issue a token
            </Button>
          </DialogTrigger>
          <DialogContent data-verify-unit="issue-token-dialog">
            <DialogHeader>
              <DialogTitle>
                {/* COPY: issue-token dialog title */}
                Issue an agent token
              </DialogTitle>
              <DialogDescription>
                {/* COPY: issue-token dialog description, stating the once-only rule up front */}
                The token value is shown once, on the next screen, and is stored
                only as a hash. Have somewhere to put it before you continue.
              </DialogDescription>
            </DialogHeader>

            <form
              onSubmit={issue}
              data-verify-unit="issue-token-form"
              data-verify-pending={pending ? "true" : "false"}
              className="flex flex-col gap-3"
            >
              <Field
                id="token-label"
                label="Label"
                // COPY: hint for the token label field
                hint="How you will tell this token from the others."
              >
                <Input
                  id="token-label"
                  name="label"
                  required
                  maxLength={120}
                  // A token label is not a credential and not a personal
                  // detail, but this form is the one place a browser might
                  // offer to remember something adjacent to one. Off.
                  autoComplete="off"
                  spellCheck={false}
                  aria-describedby="token-label-hint"
                />
              </Field>

              <fieldset className="flex flex-col gap-1.5">
                <legend className="text-muted-foreground text-xs font-medium">
                  {/* COPY: capability fieldset legend */}
                  Capabilities
                </legend>
                {[ANSWER_READ, INGEST_WRITE].map((capability) => (
                  <label
                    key={capability}
                    htmlFor={`capability-${capability}`}
                    className="flex items-center gap-2 text-sm"
                  >
                    <input
                      type="checkbox"
                      id={`capability-${capability}`}
                      name="capabilities"
                      value={capability}
                      className="accent-primary size-3.5"
                    />
                    <span className="ident">{capability}</span>
                    <span className="text-muted-foreground text-xs">
                      {CAPABILITY_HINT[capability]}
                    </span>
                  </label>
                ))}
                <p className="text-muted-foreground text-xs">
                  {/* COPY: note that neither capability reaches commercial figures */}
                  Neither reaches contract amounts. An agent has no reason to
                  read what a client is charged.
                </p>
              </fieldset>

              <Field
                id="token-expiry"
                label="Expires on"
                // COPY: hint for the token expiry field
                hint="Tokens expire. Rotate before this date rather than after it."
              >
                <Input
                  id="token-expiry"
                  name="expiresOn"
                  type="date"
                  required
                  defaultValue={defaultExpiryDay}
                  className="ident"
                  aria-describedby="token-expiry-hint"
                />
              </Field>

              {issueError === null ? null : (
                <p
                  role="alert"
                  data-verify-unit="issue-token-error"
                  className="text-state-blocked text-xs"
                >
                  {issueError}
                </p>
              )}

              <DialogFooter>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={pending}
                  onClick={() => setIssueOpen(false)}
                >
                  {/* COPY: cancel button */}
                  Cancel
                </Button>
                <Button type="submit" size="sm" disabled={pending}>
                  {/* COPY: issue button, and its pending label */}
                  {pending ? "Issuing…" : "Issue token"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {notice === null ? null : (
        <output
          data-verify-unit="token-notice"
          className="text-muted-foreground text-xs"
        >
          {notice}
        </output>
      )}

      {rowError === null ? null : (
        <p
          role="alert"
          data-verify-unit="token-row-error"
          className="text-state-blocked text-xs"
        >
          {rowError}
        </p>
      )}

      {/* No table when there is nothing in it. The screen's empty state already
          says what this list will hold, and a header row over no rows reads as a
          table that failed to load rather than one with nothing to show. */}
      <div
        className={cn(
          "border-border overflow-x-auto rounded-lg border",
          tokens.length === 0 && "hidden",
        )}
      >
        <Table data-verify-unit="token-table">
          <TableHeader>
            <TableRow>
              <TableHead>label</TableHead>
              <TableHead>capabilities</TableHead>
              <TableHead>status</TableHead>
              <TableHead>expires</TableHead>
              <TableHead>last used</TableHead>
              <TableHead>created</TableHead>
              <TableHead className="text-right">actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tokens.map((token) => {
              const revoked = token.status === "revoked";
              return (
                <TableRow
                  key={token.id}
                  data-verify-unit="token-row"
                  data-verify-token-id={token.id}
                  data-verify-status={token.status}
                >
                  <TableCell className="font-medium">{token.label}</TableCell>
                  <TableCell className="ident text-muted-foreground text-xs">
                    {token.capabilities.join(" ")}
                  </TableCell>
                  <TableCell>
                    <TokenStatusChip status={token.status} />
                  </TableCell>
                  <TableCell className="ident text-muted-foreground whitespace-nowrap">
                    {isoDay(token.expiresAt) ?? "—"}
                  </TableCell>
                  <TableCell className="ident text-muted-foreground whitespace-nowrap">
                    {isoMinute(token.lastUsedAt) ?? (
                      <span
                        className="text-muted-foreground/60"
                        title="This token has never authenticated a request."
                      >
                        {/* COPY: shown for a token that has never been used */}
                        never
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="ident text-muted-foreground whitespace-nowrap">
                    {isoDay(token.createdAt) ?? "—"}
                  </TableCell>
                  <TableCell className="text-right whitespace-nowrap">
                    {revoked ? (
                      <span className="text-muted-foreground/60 text-xs">
                        {/* COPY: shown in place of actions on a revoked token */}
                        kept for audit
                      </span>
                    ) : (
                      <div className="flex justify-end gap-1.5">
                        <Button
                          variant="outline"
                          size="xs"
                          disabled={pending}
                          onClick={() => setRotating(token)}
                          data-verify-unit="rotate-token-trigger"
                          data-verify-token-id={token.id}
                        >
                          {/* COPY: rotate button */}
                          Rotate
                        </Button>
                        <Button
                          variant="destructive"
                          size="xs"
                          disabled={pending}
                          onClick={() => setRevoking(token)}
                          data-verify-unit="revoke-token-trigger"
                          data-verify-token-id={token.id}
                        >
                          {/* COPY: revoke button */}
                          Revoke
                        </Button>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* FR-7 -- rotate. */}
      <Dialog
        open={rotating !== null}
        onOpenChange={(open) => {
          if (!open) setRotating(null);
        }}
      >
        <DialogContent data-verify-unit="rotate-token-dialog">
          <DialogHeader>
            <DialogTitle>
              {/* COPY: rotate dialog title */}
              Rotate this token
            </DialogTitle>
            <DialogDescription>
              {/* COPY: rotate dialog description, stating the issue-then-revoke order */}
              A replacement is issued with the same label and capabilities, and
              only then is this one revoked — so a run holding the old token
              keeps working until you have the new one. The new value is shown
              once.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={rotate} className="flex flex-col gap-3">
            <p className="ident text-foreground text-sm">
              {rotating?.label ?? ""}
            </p>
            <Field
              id="rotate-expiry"
              label="New expiry"
              // COPY: hint for the rotate expiry field
              hint="The replacement carries its own expiry."
            >
              <Input
                id="rotate-expiry"
                name="expiresOn"
                type="date"
                required
                defaultValue={defaultExpiryDay}
                className="ident"
                aria-describedby="rotate-expiry-hint"
              />
            </Field>

            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={pending}
                onClick={() => setRotating(null)}
              >
                {/* COPY: cancel button */}
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={pending}
                data-verify-unit="rotate-token-confirm"
              >
                {/* COPY: rotate confirm button, and its pending label */}
                {pending ? "Rotating…" : "Rotate"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* FR-7 -- revoke. */}
      <Dialog
        open={revoking !== null}
        onOpenChange={(open) => {
          if (!open) setRevoking(null);
        }}
      >
        <DialogContent data-verify-unit="revoke-token-dialog">
          <DialogHeader>
            <DialogTitle>
              {/* COPY: revoke dialog title */}
              Revoke this token
            </DialogTitle>
            <DialogDescription>
              {/* COPY: revoke dialog description, naming the immediate effect */}
              Any agent still presenting it is refused from the next request. The
              row is kept, revoked, for the audit window — it is not deleted.
            </DialogDescription>
          </DialogHeader>

          <p className="ident text-foreground text-sm">
            {revoking?.label ?? ""}
          </p>

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={pending}
              onClick={() => setRevoking(null)}
            >
              {/* COPY: cancel button */}
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              disabled={pending}
              onClick={revoke}
              data-verify-unit="revoke-token-confirm"
            >
              {/* COPY: revoke confirm button, and its pending label */}
              {pending ? "Revoking…" : "Revoke"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* §7a's once. Held in state, cleared on dismissal, never persisted. */}
      {reveal === null ? null : (
        <TokenPlaintextPanel
          tokenId={reveal.tokenId}
          label={reveal.label}
          plaintext={reveal.plaintext}
          rotated={reveal.rotated}
          onDismiss={() => setReveal(null)}
        />
      )}
    </div>
  );
}
