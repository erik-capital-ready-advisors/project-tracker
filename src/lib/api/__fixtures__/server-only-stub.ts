/**
 * A no-op stand-in for the `server-only` package, used ONLY by the vitest alias
 * in `vitest.config.ts`.
 *
 * The real package throws the moment it is imported outside a React Server
 * Component, which is exactly what makes it useful: an accidental import of the
 * service-role client from a Client Component becomes a build error rather than
 * a runtime key leak. The same throw makes any unit test that touches such a
 * module unrunnable, because vitest is neither a server nor a client bundle.
 *
 * Aliasing it away in the test harness does not weaken the guarantee. The
 * guarantee is enforced by Next's bundler at `pnpm build`, which is a separate
 * gate that still runs and still sees the real package.
 */
export {};
