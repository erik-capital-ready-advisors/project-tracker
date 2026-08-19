"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import type { ActionResult } from "@/lib/action-result";
import { NativeSelect } from "@/components/native-select";
import { Button } from "@/components/ui/button";

/**
 * FR-26's "one click": pick the engagement, press the button, the session
 * leaves the queue.
 *
 * ## The action arrives as a prop
 *
 * `onAttribute` is passed down from the Server Component rather than imported
 * here. Passing a Server Action as a prop is a supported Next pattern, and it
 * buys the property this unit needs most: the component can be rendered in a
 * unit test with a plain async function in that slot, so the whole interaction
 * -- choose, submit, pending, refuse, succeed -- is exercised without a database,
 * a session, or a browser. A component that reaches for its own action can only
 * ever be tested end to end.
 *
 * ## Nothing about the session's content is held here
 *
 * §7a classifies `work_session.summary` sensitive: "it may quote anything Erik
 * was working on, including another client's codebase." This component receives
 * an id and a list of engagement slugs, and nothing else. No summary text
 * reaches a `data-verify-*` attribute, a URL, or an error message.
 */
export function AttributeForm({
  sessionId,
  engagements,
  onAttribute,
}: {
  sessionId: string;
  /** Slug and display name. Never the whole engagement record. */
  engagements: readonly { slug: string; clientName: string }[];
  onAttribute: (
    sessionId: string,
    engagementSlug: string,
  ) => Promise<ActionResult<unknown>>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [slug, setSlug] = useState("");
  const [error, setError] = useState<string | null>(null);

  const selectId = `attribute-${sessionId}`;

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (slug === "") {
      // COPY: refusal when no engagement was chosen
      setError("Choose the engagement this session belongs to.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await onAttribute(sessionId, slug);
      if (result.ok) {
        router.refresh();
        return;
      }
      setError(result.message);
    });
  }

  return (
    <form
      onSubmit={submit}
      data-verify-unit="attribute-form"
      data-verify-session={sessionId}
      data-verify-pending={pending ? "true" : "false"}
      className="flex flex-wrap items-start gap-2"
    >
      <label htmlFor={selectId} className="sr-only">
        {/* COPY: accessible label for the engagement picker */}
        Engagement to attribute this session to
      </label>
      <div className="w-52">
        <NativeSelect
          id={selectId}
          value={slug}
          disabled={pending}
          aria-invalid={error === null ? undefined : true}
          aria-describedby={error === null ? undefined : `${selectId}-error`}
          onChange={(event) => {
            setSlug(event.target.value);
            setError(null);
          }}
          className="ident"
        >
          {/* COPY: placeholder option in the engagement picker */}
          <option value="">choose an engagement…</option>
          {engagements.map((engagement) => (
            <option key={engagement.slug} value={engagement.slug}>
              {engagement.slug} — {engagement.clientName}
            </option>
          ))}
        </NativeSelect>
      </div>

      <Button type="submit" size="sm" disabled={pending}>
        {/* COPY: the attribute button, and its pending label */}
        {pending ? "Attributing…" : "Attribute"}
      </Button>

      {error === null ? null : (
        <p
          id={`${selectId}-error`}
          role="alert"
          data-verify-unit="attribute-error"
          className="text-state-blocked basis-full text-xs"
        >
          {error}
        </p>
      )}
    </form>
  );
}
