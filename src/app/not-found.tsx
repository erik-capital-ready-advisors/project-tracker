import Link from "next/link";

import { EmptyState, Screen } from "@/components/screen";

export default function NotFound() {
  return (
    <Screen
      title="Not found"
      question="That route does not exist in this build."
    >
      {/* COPY: 404 headline and detail */}
      <EmptyState
        headline="No screen at this address."
        detail="Press ⌘K to jump to one of the six answers, or go back to the index."
      />
      <div>
        <Link href="/" className="text-primary text-sm underline">
          Back to the index
        </Link>
      </div>
    </Screen>
  );
}
