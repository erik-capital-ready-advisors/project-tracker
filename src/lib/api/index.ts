/**
 * The server-side API primitives, in one import.
 *
 * This is the surface i5, i6, i8 and every later route handler consume. Import
 * from `@/lib/api` rather than from the individual files, so that a change of
 * internal layout does not ripple through every route.
 *
 *     import { withAgentRoute, apiOk, apiError, ANSWER_READ } from "@/lib/api";
 *
 * `token-admin` and `operator` are **not** re-exported here. Both are
 * operator-side and `operator.ts` carries `import "server-only"`, so folding
 * them into this barrel would make a Client Component that imports one API
 * helper fail to build for a reason that has nothing to do with what it asked
 * for. Import those two by their own paths.
 */

export {
  ANSWER_READ,
  AGENT_ENGAGEMENT_COLUMNS,
  AGENT_FORBIDDEN_EMBED_ALIASES,
  AGENT_FORBIDDEN_TABLES,
  INGEST_WRITE,
  WIRE_CAPABILITIES,
  embeddedEngagementViolations,
  engagementColumnViolations,
  isAgentForbiddenTable,
  parseWireCapabilities,
  parseWireCapability,
  projectionReachesForbiddenTable,
  toStoredCapability,
  toWireCapability,
} from "./capabilities";
export type {
  AgentForbiddenTable,
  StoredCapability,
  WireCapability,
} from "./capabilities";

export {
  API_ERROR_STATUS,
  ApiError,
  apiError,
  apiOk,
  toErrorResponse,
} from "./errors";
export type { ApiErrorBody, ApiErrorCode, ApiOkBody } from "./errors";

export {
  AGENT_FORBIDDEN_RPCS,
  agentScopedDb,
} from "./agent-db";

export {
  assertCapability,
  authenticateAgentRequest,
} from "./authenticate";
export type {
  AgentAuthResult,
  AuthenticatedAgentToken,
} from "./authenticate";

export { endpointOf, writeAuditLog } from "./audit";
export type { AuditEntry, AuditOutcome } from "./audit";

export {
  RATE_LIMIT_POLICIES,
  enforceRateLimit,
  policyFor,
  rateLimitedResponse,
} from "./rate-limit";
export type { RateLimitPolicy, RateLimitVerdict } from "./rate-limit";

export {
  AGENT_TOKEN_PREFIX,
  bearerFromAuthorizationHeader,
  describeTokenForLog,
  mintAgentToken,
  mintAgentTokenWithNewId,
  parseAgentToken,
} from "./tokens";
export type { AgentTokenParts, MintedAgentToken } from "./tokens";

export { createAgentRouteGuard, withAgentRoute } from "./guard";
export type {
  AgentRouteContext,
  AgentRouteDeps,
  AgentRouteHandler,
} from "./guard";

export { findUnknownKeys, unknownKeyProblems } from "./unknown-keys";
export type { UnknownKey } from "./unknown-keys";
