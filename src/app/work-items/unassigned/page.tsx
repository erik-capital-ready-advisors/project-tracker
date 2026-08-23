import { EmptyState, Screen } from "@/components/screen";
import { OperatorLoadNotice } from "@/components/operator-load-notice";
import { loadForOperator } from "@/lib/operator-load";

import { attributeSessionSafe } from "../actions";
import { WorkItemTabs } from "../_components/work-item-tabs";
import { duration, isoMinute } from "@/lib/display-format";
import { readEngagements, readUnassignedQueue } from "../_lib/load";
import { AttributeForm } from "./_components/attribute-form";

export const metadata = { title: "Unassigned sessions — Delivery Ledger" };

/**
 * FR-26 -- a session that resolves to no known engagement is stored against an
 * `unassigned` engagement and **listed for Erik to attribute in one click,
 * rather than discarded**.
 *
 * The requirement's own emphasis is on the second half, and that is what shapes
 * this screen. The failure it is written against is a hook that silently drops a
 * session it could not place; the failure this screen could still introduce is a
 * queue Erik never opens. So the queue is a work list: newest first, one control
 * per row, and enough context beside it -- when, how long, which stack, which
 * directory -- to place the session without opening anything else.
 *
 * ## The summary is shown, and this is the one place client prose appears
 *
 * §7a classifies `work_session.summary` **sensitive**: "it may quote anything
 * Erik was working on, including another client's codebase", and it is
 * "decrypted server-side" for the operator. This screen is the operator, and the
 * summary is the field that actually tells him whose work it was -- withholding
 * it would leave a queue nobody can clear.
 *
 * What is enforced around it: it is never written to a `data-verify-*`
 * attribute, never put in a URL, never logged, and never echoed into an error
 * message. `null` is rendered as its own statement rather than as an empty
 * string, because "there was nothing there" and "it could not be decrypted" are
 * different facts and `i6` deliberately returns the same `null` for both.
 */
export default async function UnassignedSessionsPage() {
  const [queue, engagements] = await Promise.all([
    loadForOperator(() => readUnassignedQueue()),
    loadForOperator(() => readEngagements()),
  ]);

  const sessions = queue.ok ? queue.data.sessions : [];
  const options = engagements.ok
    ? engagements.data
        .filter((engagement) => engagement.slug !== "unassigned")
        .map((engagement) => ({
          slug: engagement.slug,
          clientName: engagement.clientName,
        }))
    : [];

  return (
    <Screen
      title="Unassigned sessions"
      question="Which sessions could not be placed against an engagement, and where does each belong?"
      requirements={["FR-26"]}
    >
      <WorkItemTabs
        active="queue"
        queueCount={queue.ok ? queue.data.sessions.length : null}
      />

      {queue.ok ? null : (
        <OperatorLoadNotice
          reason={queue.reason}
          detail={queue.detail}
          screen="Unassigned sessions"
        />
      )}

      {queue.ok && !engagements.ok ? (
        <OperatorLoadNotice
          reason={engagements.reason}
          detail={engagements.detail}
          screen="Engagement list"
        />
      ) : null}

      {queue.ok && queue.data.truncated ? (
        <p
          data-verify-unit="queue-truncated"
          className="text-state-carried text-xs"
        >
          This page of the queue is full, so there are more sessions behind it.
          Attribute these and reload.
        </p>
      ) : null}

      {!queue.ok ? null : sessions.length === 0 ? (
        <EmptyState
          headline="Nothing is waiting to be attributed."
          detail="A session whose working directory matches no engagement lands here instead of being discarded. The queue is empty, which means every recorded session has an engagement."
        />
      ) : (
        <ul
          data-verify-unit="unassigned-queue"
          data-verify-count={sessions.length}
          className="flex flex-col gap-2"
        >
          {sessions.map((session) => {
            const started = isoMinute(session.startedAt);
            const length = duration(session.durationMinutes);

            return (
              <li
                key={session.id}
                data-verify-unit="unassigned-session"
                data-verify-session={session.id}
                data-verify-has-summary={session.summary === null ? "false" : "true"}
                className="border-border rounded-lg border px-3 py-3"
              >
                <div className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                  <span className="ident text-foreground font-medium">
                    {started ?? "start not recorded"}
                  </span>
                  {length === null ? null : <span className="ident">{length}</span>}
                  {session.stackName === null ? null : (
                    <span className="ident">{session.stackName}</span>
                  )}
                  {session.source === null ? null : (
                    <span className="ident">{session.source}</span>
                  )}
                  {session.filesChanged === null ? null : (
                    <span className="ident">
                      {session.filesChanged} file
                      {session.filesChanged === 1 ? "" : "s"}
                    </span>
                  )}
                  {session.commits === null ? null : (
                    <span className="ident">
                      {session.commits} commit
                      {session.commits === 1 ? "" : "s"}
                    </span>
                  )}
                </div>

                {session.workingDirectory === null ? null : (
                  <p className="ident text-muted-foreground mt-1 truncate text-xs">
                    {session.workingDirectory}
                  </p>
                )}

                {session.summary === null ? (
                  <p className="text-muted-foreground/70 mt-2 text-sm italic">
                    No summary is available. It was either never recorded or
                    could not be decrypted — those are different facts and the
                    system does not know which this is.
                  </p>
                ) : (
                  <p className="text-foreground mt-2 line-clamp-3 text-sm">
                    {session.summary}
                  </p>
                )}

                <div className="mt-3">
                  <AttributeForm
                    sessionId={session.id}
                    engagements={options}
                    onAttribute={attributeSessionSafe}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Screen>
  );
}
