import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MfaEnrollForm } from "@/app/sign-in/_components/mfa-enroll-form";
import { MfaVerifyForm } from "@/app/sign-in/_components/mfa-verify-form";

/**
 * FR-2's two screens, and the first-run trap they exist to survive.
 *
 * `i1` left no MFA-enrolment carve-out in row-level security. At `aal1` the
 * operator's own row in `public.operator` returns zero rows, and reading that as
 * "no account" locks Erik out with the enrolment he needs behind the
 * conclusion. Nothing in either component reads a table; these tests assert the
 * routing that follows from GoTrue alone.
 *
 * The TOTP secret below is a synthetic base32 string. It is not, and never was,
 * a factor for any account.
 */

const FAKE_TOTP_SECRET = "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP";
const FAKE_QR = "data:image/svg+xml;utf-8,<svg xmlns='http://www.w3.org/2000/svg'/>";

const replace = vi.fn();
const refresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, refresh, push: vi.fn() }),
}));

const api = vi.hoisted(() => ({
  getUser: vi.fn(),
  getAuthenticatorAssuranceLevel: vi.fn(),
  listFactors: vi.fn(),
  enroll: vi.fn(),
  challenge: vi.fn(),
  verify: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: {
      getUser: api.getUser,
      signOut: api.signOut,
      mfa: {
        getAuthenticatorAssuranceLevel: api.getAuthenticatorAssuranceLevel,
        listFactors: api.listFactors,
        enroll: api.enroll,
        challenge: api.challenge,
        verify: api.verify,
      },
    },
  }),
}));

beforeEach(() => {
  replace.mockClear();
  refresh.mockClear();
  api.getUser.mockReset().mockResolvedValue({ data: { user: { id: "u" } } });
  api.getAuthenticatorAssuranceLevel
    .mockReset()
    .mockResolvedValue({ data: { currentLevel: "aal1", nextLevel: "aal1" } });
  api.listFactors.mockReset().mockResolvedValue({ data: { totp: [] }, error: null });
  api.enroll.mockReset().mockResolvedValue({
    data: {
      id: "factor-1",
      totp: { qr_code: FAKE_QR, secret: FAKE_TOTP_SECRET, uri: "otpauth://" },
    },
    error: null,
  });
  api.challenge.mockReset().mockResolvedValue({ data: { id: "chal-1" }, error: null });
  api.verify.mockReset().mockResolvedValue({ data: {}, error: null });
  api.signOut.mockReset().mockResolvedValue({ error: null });
});

afterEach(cleanup);

describe("MfaEnrollForm — the first-run screen", () => {
  it("enrols a factor for an operator whose own row is unreadable", async () => {
    render(<MfaEnrollForm />);

    await waitFor(() => expect(api.enroll).toHaveBeenCalledWith({ factorType: "totp" }));
    // It did not conclude "no account" and it did not redirect away.
    expect(replace).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(
        document
          .querySelector("[data-verify-unit='mfa-enroll']")
          ?.getAttribute("data-verify-has-factor"),
      ).toBe("true"),
    );
  });

  it("enrols without a friendly name, so a retry is not a naming error", async () => {
    render(<MfaEnrollForm />);
    await waitFor(() => expect(api.enroll).toHaveBeenCalledTimes(1));
    expect(api.enroll.mock.calls[0][0]).toEqual({ factorType: "totp" });
  });

  it("shows the secret for manual entry and puts it in NO data-verify attribute", async () => {
    render(<MfaEnrollForm />);
    await waitFor(() =>
      expect(document.body.textContent).toContain(FAKE_TOTP_SECRET),
    );

    for (const element of Array.from(document.querySelectorAll("*"))) {
      for (const attribute of Array.from(element.attributes)) {
        if (!attribute.name.startsWith("data-verify-")) continue;
        expect(attribute.value).not.toContain(FAKE_TOTP_SECRET);
      }
    }
  });

  it("refuses a malformed code without a round trip to GoTrue", async () => {
    render(<MfaEnrollForm />);
    await waitFor(() => expect(api.enroll).toHaveBeenCalled());

    fireEvent.change(screen.getByLabelText("Six-digit code"), {
      target: { value: "123" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Confirm and finish" }));

    await waitFor(() =>
      expect(
        document.querySelector("[data-verify-unit='auth-error']")?.textContent,
      ).toContain("six digits"),
    );
    expect(api.challenge).not.toHaveBeenCalled();
  });

  it("clears the secret from the page once the factor is confirmed", async () => {
    render(<MfaEnrollForm />);
    await waitFor(() => expect(api.enroll).toHaveBeenCalled());

    fireEvent.change(screen.getByLabelText("Six-digit code"), {
      target: { value: "123456" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Confirm and finish" }));

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/"));
    // `waitFor` because the state clearing the secret flushes after the
    // navigation call, not because the claim is soft: the secret must leave the
    // DOM, and this fails if it does not.
    await waitFor(() =>
      expect(document.body.textContent).not.toContain(FAKE_TOTP_SECRET),
    );
  });

  it("sends an operator who already holds a factor to the verify screen", async () => {
    api.getAuthenticatorAssuranceLevel.mockResolvedValue({
      data: { currentLevel: "aal1", nextLevel: "aal2" },
    });
    render(<MfaEnrollForm />);

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/sign-in/verify"));
    // And it did not create a second factor on the way past.
    expect(api.enroll).not.toHaveBeenCalled();
  });

  it("sends an operator with no session back to the password screen", async () => {
    api.getUser.mockResolvedValue({ data: { user: null } });
    render(<MfaEnrollForm />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/sign-in"));
  });
});

describe("MfaVerifyForm", () => {
  beforeEach(() => {
    api.getAuthenticatorAssuranceLevel.mockResolvedValue({
      data: { currentLevel: "aal1", nextLevel: "aal2" },
    });
    api.listFactors.mockResolvedValue({
      data: { totp: [{ id: "factor-1", status: "verified" }] },
      error: null,
    });
  });

  it("challenges the enrolled factor and verifies the code against it", async () => {
    render(<MfaVerifyForm />);
    await waitFor(() =>
      expect(
        document
          .querySelector("[data-verify-unit='mfa-verify-form']")
          ?.getAttribute("data-verify-loading"),
      ).toBe("false"),
    );

    fireEvent.change(screen.getByLabelText("Six-digit code"), {
      target: { value: "654321" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Verify" }));

    await waitFor(() =>
      expect(api.verify).toHaveBeenCalledWith({
        factorId: "factor-1",
        challengeId: "chal-1",
        code: "654321",
      }),
    );
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/"));
  });

  it("sends an operator with no verified factor to enrolment, not to a refusal", async () => {
    api.getAuthenticatorAssuranceLevel.mockResolvedValue({
      data: { currentLevel: "aal1", nextLevel: "aal1" },
    });
    render(<MfaVerifyForm />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/sign-in/enroll"));
  });

  it("surfaces GoTrue's refusal of a wrong code and stays put", async () => {
    api.verify.mockResolvedValue({ error: { message: "Invalid TOTP code entered" } });
    render(<MfaVerifyForm />);
    await waitFor(() =>
      expect(
        document
          .querySelector("[data-verify-unit='mfa-verify-form']")
          ?.getAttribute("data-verify-loading"),
      ).toBe("false"),
    );

    fireEvent.change(screen.getByLabelText("Six-digit code"), {
      target: { value: "000000" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Verify" }));

    await waitFor(() =>
      expect(
        document.querySelector("[data-verify-unit='auth-error']")?.textContent,
      ).toContain("Invalid TOTP code"),
    );
    expect(replace).not.toHaveBeenCalled();
  });

  it("offers a way out of a half-authenticated session", async () => {
    // Without this an operator stuck at aal1 has no control at all: every
    // screen refuses and there is nothing to click.
    render(<MfaVerifyForm />);
    await waitFor(() =>
      expect(document.querySelector("[data-verify-unit='auth-sign-out']")).not.toBeNull(),
    );

    fireEvent.click(
      document.querySelector("[data-verify-unit='auth-sign-out']") as HTMLElement,
    );
    await waitFor(() => expect(api.signOut).toHaveBeenCalled());
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/sign-in"));
  });
});

/**
 * Every test above mounts bare. `next.config.ts` sets `reactStrictMode: true`,
 * so development mounts, unmounts and remounts each of these components before
 * the first async continuation resolves - and a bare mount cannot reproduce
 * that. The whole suite was green at 966 passing while the enrol screen
 * rendered its heading and no QR code on the real dev server, because the
 * request fired, the response was discarded by a cancel-flag, and the ref guard
 * made the second mount return early. Run b0952e.
 *
 * These mount under StrictMode for exactly that reason. The pairing is the
 * point: the QR must appear AND `enroll` must still be called once, because the
 * naive fix - dropping the ref guard - buys the render back by creating a
 * second unverified factor and putting a fresh secret on screen.
 */
describe("the auth screens under StrictMode, as development actually mounts them", () => {
  it("MfaEnrollForm renders the QR, and still enrols exactly once", async () => {
    render(
      <StrictMode>
        <MfaEnrollForm />
      </StrictMode>,
    );

    await waitFor(() =>
      expect(
        document.querySelector("[data-verify-unit='mfa-enroll'] img"),
      ).not.toBeNull(),
    );
    expect(api.enroll).toHaveBeenCalledTimes(1);
    expect(replace).not.toHaveBeenCalled();
  });

  it("MfaEnrollForm leaves loading false, so the frame is not stuck", async () => {
    render(
      <StrictMode>
        <MfaEnrollForm />
      </StrictMode>,
    );

    await waitFor(() =>
      expect(
        document
          .querySelector("[data-verify-unit='mfa-enroll']")
          ?.getAttribute("data-verify-loading"),
      ).toBe("false"),
    );
  });

  it("MfaVerifyForm resolves its factor rather than hanging", async () => {
    api.listFactors.mockResolvedValue({
      data: { totp: [{ id: "factor-verified" }] },
      error: null,
    });
    api.getAuthenticatorAssuranceLevel.mockResolvedValue({
      data: { currentLevel: "aal1", nextLevel: "aal2" },
    });

    render(
      <StrictMode>
        <MfaVerifyForm />
      </StrictMode>,
    );

    await waitFor(() => expect(api.listFactors).toHaveBeenCalled());
    expect(replace).not.toHaveBeenCalled();
  });
});
