import type { components } from "../generated/schema.js";

// Schema-derived types (generated from spec/openapi.json — do not hand-edit).
export type Controller = components["schemas"]["Controller"];
export type ControllerDoor = components["schemas"]["ControllerDoor"];
export type DoorOpenRequest = components["schemas"]["DoorOpenRequest"];
export type RelayOpenRequest = components["schemas"]["RelayOpenRequest"];
export type RelayCloseRequest = components["schemas"]["RelayCloseRequest"];
/**
 * `status: "sent"` means the command frame was written to the controller's
 * socket — NOT confirmation the door/relay physically actuated. Execution is
 * only observable via subsequent events.
 */
export type CommandAccepted = components["schemas"]["CommandAccepted"];
