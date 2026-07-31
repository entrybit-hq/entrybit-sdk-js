/**
 * Access control: discover controllers, then momentarily open a door.
 *
 * Run with:
 *   ENTRYBIT_API_KEY=eb_sk_... npx tsx examples/access-control.ts            # list only
 *   ENTRYBIT_API_KEY=eb_sk_... npx tsx examples/access-control.ts --open     # also open a door
 *
 * The key needs `org:controllers:read` (and `org:doors:open` to actuate).
 * These are SERVER-SIDE operations: an `eb_sk_…` key is a secret and must
 * never ship in a mobile or browser app.
 *
 * Read before automating anything on top of this:
 * - A resolved `open()` means the command was SENT (written to the
 *   controller's socket) — not that the door physically opened.
 * - An offline controller throws `ConflictError` with code
 *   `controller_offline`. The command is never queued or replayed.
 * - Opens are never auto-retried. Retry only with live human intent: a
 *   duplicate open re-fires the lock.
 */
import { ConflictError, EntryBit, PermissionError } from "@entrybit/sdk";

// Reads ENTRYBIT_API_KEY from the environment automatically.
const entrybit = new EntryBit();

try {
  const controllers = await entrybit.org.controllers.list();

  if (controllers.length === 0) {
    console.log("No controllers on this organization.");
  }

  for (const c of controllers) {
    const state = c.online ? `online (${c.protocol ?? "?"})` : "OFFLINE";
    console.log(`\n${c.sn}  ${c.description ?? ""}  — ${state}`);
    for (const d of c.doors ?? []) {
      console.log(
        `   door ${d.door_no}: ${d.name ?? "(unnamed)"}` +
          `${d.openable ? "" : "   [not remotely openable]"}`,
      );
    }
  }

  if (!process.argv.includes("--open")) {
    console.log("\nPass --open to momentarily open the first openable door.");
  } else {
    // Only an online controller can receive a command, and only `Control`
    // doors may be opened — the API rejects anything else.
    const target = controllers.find((c) => c.online && (c.doors ?? []).some((d) => d.openable));
    const door = target?.doors?.find((d) => d.openable);

    if (!target?.sn || door?.door_no == null) {
      console.log("\nNo online controller with an openable door.");
    } else {
      console.log(`\nOpening ${target.sn} door ${door.door_no} (${door.name ?? "unnamed"})…`);
      const res = await entrybit.org.doors.open({
        controller_sn: target.sn,
        door_no: door.door_no,
      });
      // "sent" — written to the controller. Physical execution shows up in
      // the device's own event stream, not in this response.
      console.log(`status: ${res.status} via ${res.protocol ?? "?"}`);
    }
  }
} catch (err) {
  if (err instanceof PermissionError) {
    console.error("The API key is missing a scope:", err.missingScope);
  } else if (err instanceof ConflictError && err.code === "controller_offline") {
    console.error("Controller is offline — nothing was sent, nothing was queued.");
  } else {
    throw err;
  }
}
