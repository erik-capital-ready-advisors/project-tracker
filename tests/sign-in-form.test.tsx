import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SignInForm } from "@/app/sign-in/_components/sign-in-form";

/**
 * FR-1 and FR-2 at the screen.
 *
 * No password, code or secret in this file is real; the fakes stand in for
 * GoTrue and authenticate nothing. What is asserted is where the screen sends
 * an operator, which is the decision that can lock Erik out of his own product
 * if it is wrong.
 */

const replace = vi.fn();
const refresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, refresh, push: vi.fn() }),
}));

const auth = vi.hoisted(() => ({
  getUser: vi.fn(),
  signInWithPassword: vi.fn(),
  getAuthenticatorAssuranceLevel: vi.fn(),
  /** Set to throw, to stand in for an unconfigured deployment. */
  construct: vi.fn(),
}));

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => {
    auth.construct();
    return {
      auth: {
        getUser: auth.getUser,
        signInWithPassword: auth.signInWithPassword,
        mfa: {
          getAuthenticatorAssuranceLevel: auth.getAuthenticatorAssuranceLevel,
        },
      },
    };
  },
}));

beforeEach(() => {
  replace.mockClear();
  refresh.mockClear();
  auth.construct.mockReset();
  auth.getUser.mockReset().mockResolvedValue({ data: { user: null } });
  auth.signInWithPassword.mockReset().mockResolvedValue({ error: null });
  auth.getAuthenticatorAssuranceLevel
    .mockReset()
    .mockResolvedValue({ data: { currentLevel: "aal1", nextLevel: "aal2" } });
});

afterEach(cleanup);

async function signIn() {
  await waitFor(() =>
    expect(
      document
        .querySelector("[data-verify-unit='sign-in-form']")
        ?.getAttribute("data-verify-checking"),
    ).toBe("false"),
  );
  fireEvent.change(screen.getByLabelText("Email"), {
    target: { value: "operator@example.test" },
  });
  fireEvent.change(screen.getByLabelText("Password"), {
    target: { value: "not-a-real-password" },
  });
  // By role: the heading also reads "Sign in".
  fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
}

describe("FR-1 — no public signup", () => {
  it("offers no account-creation or self-service reset affordance", async () => {
    render(<SignInForm />);
    await waitFor(() =>
      expect(document.querySelector("[data-verify-unit='sign-in-form']")).not.toBeNull(),
    );

    // `disable_signup` is set on the project and a signup control here would
    // imply a door that is bolted shut.
    expect(screen.queryByText(/create an account/i)).toBeNull();
    expect(screen.queryByText(/sign up/i)).toBeNull();
    expect(screen.queryByText(/forgot/i)).toBeNull();
    expect(document.querySelector("a[href*='signup']")).toBeNull();
  });
});

describe("where a successful sign-in sends the operator", () => {
  it("FIRST RUN — no second factor enrolled goes to enrolment, not to a refusal", async () => {
    auth.getAuthenticatorAssuranceLevel.mockResolvedValue({
      data: { currentLevel: "aal1", nextLevel: "aal1" },
    });
    render(<SignInForm />);
    await signIn();

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/sign-in/enroll"));
  });

  it("a factor already enrolled goes to the verify screen", async () => {
    render(<SignInForm />);
    await signIn();
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/sign-in/verify"));
  });

  it("an already-aal2 session goes straight to the ledger", async () => {
    auth.getAuthenticatorAssuranceLevel.mockResolvedValue({
      data: { currentLevel: "aal2", nextLevel: "aal2" },
    });
    render(<SignInForm />);
    await signIn();
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/"));
  });

  it("refreshes so the Server Components see the new cookie", async () => {
    render(<SignInForm />);
    await signIn();
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });
});

describe("failures", () => {
  it("shows GoTrue's own message and navigates nowhere", async () => {
    auth.signInWithPassword.mockResolvedValue({
      error: { message: "Invalid login credentials" },
    });
    render(<SignInForm />);
    await signIn();

    await waitFor(() =>
      expect(
        document.querySelector("[data-verify-unit='auth-error']")?.textContent,
      ).toBe("Invalid login credentials"),
    );
    expect(replace).not.toHaveBeenCalled();
  });

  it("survives an unconfigured deployment instead of blanking the page", async () => {
    auth.construct.mockImplementation(() => {
      throw new Error("Missing required environment variable NEXT_PUBLIC_SUPABASE_URL.");
    });
    render(<SignInForm />);

    await waitFor(() =>
      expect(
        document.querySelector("[data-verify-unit='auth-error']")?.textContent,
      ).toContain("NEXT_PUBLIC_SUPABASE_URL"),
    );
    // The form is still there, disabled, rather than replaced by an error page
    // with nothing to click -- this is the one route with no way back.
    expect(
      (screen.getByLabelText("Email") as HTMLInputElement).disabled,
    ).toBe(true);
  });
});

describe("an existing session is honoured on arrival", () => {
  it("forwards a signed-in operator to the step they are actually on", async () => {
    auth.getUser.mockResolvedValue({ data: { user: { id: "u" } } });
    auth.getAuthenticatorAssuranceLevel.mockResolvedValue({
      data: { currentLevel: "aal1", nextLevel: "aal1" },
    });

    render(<SignInForm />);

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/sign-in/enroll"));
    // And it did not ask for a password it already has.
    expect(auth.signInWithPassword).not.toHaveBeenCalled();
  });
});
