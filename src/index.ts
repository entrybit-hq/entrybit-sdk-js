// Client
export { EntryBit } from "./client.js";
export { VERSION, BUILD_SHA } from "./version.js";

// Errors
export {
  EntryBitError,
  AuthenticationError,
  PermissionError,
  NotFoundError,
  ConflictError,
  RateLimitError,
  ValidationError,
  UnprocessableEntityError,
  APIError,
  InternalServerError,
  ConnectionError,
  TimeoutError,
  UserAbortError,
} from "./errors/index.js";
export type { EntryBitErrorOptions } from "./errors/index.js";

// Core constants
export { DEFAULT_BASE_URL } from "./core/http.js";
export { USER_AGENT, CLIENT_TELEMETRY_HEADER } from "./core/runtime.js";

// Resource classes (exported so consumers can name, mock, and extend them)
export { Passes, OrgPasses } from "./resources/passes.js";
export { OrgMembers } from "./resources/members.js";
export { Facilities } from "./resources/facilities.js";
export { Invites } from "./resources/invites.js";
export { Me } from "./resources/me.js";
export { Org } from "./resources/org.js";
export { OAuth } from "./resources/oauth.js";

// Public types (one file per domain under ./types/)
export type {
  ApiKeyHeader,
  AppInfo,
  ClientDebugInfo,
  ClientEventMap,
  ClientOptions,
  Logger,
  LogLevel,
  RequestEvent,
  ResponseEvent,
  QueryValue,
  RequestOptions,
  RequestSpec,
  ResponseWithMeta,
  CursorPage,
  Pass,
  PassPage,
  PassCreateRequest,
  PassCreateResponse,
  RevokeResponse,
  ListPassesParams,
  Member,
  MemberPage,
  ListMembersParams,
  GetMemberParams,
  Facility,
  OrgInvite,
  MeResponse,
  TokenResponse,
  IntrospectionResponse,
  UserInfo,
  ExchangeCodeParams,
  RefreshTokenParams,
  RevokeTokenParams,
  IntrospectTokenParams,
} from "./types/index.js";

// Raw generated OpenAPI types
export type { paths, components, operations } from "./generated/schema.js";
