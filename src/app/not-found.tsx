import Link from "next/link";

import { EmptyState, Screen } from "@/components/screen";

export default function NotFound() {
  return (
    <Screen
      title="Not found"
      question="That route does not exist in this build."
    >
      <EmptyState
        headline="No screen at this address."
        detail="Nothing was read, so this says nothing about the ledger. Press ⌘K to jump to one of the six answers."
      />
      <div>
        <Link href="/" className="text-primary text-sm underline">
          Back to the index
        </Link>
      </div>
    </Screen>
  );
}
