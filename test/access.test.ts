import { describe, expect, it } from "vitest";
import { ConflictError, EntryBit, PermissionError } from "../src/index.js";
import { mockFetch } from "./helpers.js";

const CONTROLLERS = {
  success: true,
  controllers: [
    {
      sn: "EB123456",
      description: "Lobby",
      online: true,
      protocol: "tcp",
      doors: [
        { door_no: 0, name: "Front door", openable: true },
        { door_no: 4, name: "Spare", openable: false },
      ],
    },
  ],
};

const SENT = {
  success: true,
  controller_sn: "EB123456",
  door_no: 0,
  status: "sent",
  protocol: "tcp",
};

describe("org access control", () => {
  it("lists controllers with doors and live online state", async () => {
    const { fn, requests } = mockFetch({ body: CONTROLLERS });
    const eb = new EntryBit({ apiKey: "eb_sk_test", fetch: fn });
    const controllers = await eb.org.controllers.list();
    expect(requests[0]!.url).toBe("https://api.entrybit.net/api/v1/org/controllers");
    expect(controllers[0]!.online).toBe(true);
    expect(controllers[0]!.doors![1]!.openable).toBe(false);
  });

  it("opens a door: POST body passes through, 202 'sent' resolves", async () => {
    const { fn, requests } = mockFetch({ status: 202, body: SENT });
    const eb = new EntryBit({ apiKey: "eb_sk_test", fetch: fn });
    const res = await eb.org.doors.open({ controller_sn: "EB123456", door_no: 0 });
    expect(requests[0]!.method).toBe("POST");
    expect(JSON.parse(requests[0]!.body ?? "{}")).toEqual({
      controller_sn: "EB123456",
      door_no: 0,
    });
    expect(res.status).toBe("sent");
  });

  it("maps an offline controller to ConflictError with code 'controller_offline'", async () => {
    const { fn } = mockFetch({
      status: 409,
      body: {
        success: false,
        error: "controller_offline",
        message:
          "The controller is not connected — the command was not sent and will not be queued.",
      },
    });
    const eb = new EntryBit({ apiKey: "eb_sk_test", fetch: fn });
    const err = await eb.org.doors
      .open({ controller_sn: "EB123456", door_no: 0 })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ConflictError);
    expect((err as ConflictError).code).toBe("controller_offline");
  });

  it("NEVER retries a door open — one attempt even on 503", async () => {
    const { fn, spy } = mockFetch({ status: 503, body: {} }, { status: 202, body: SENT });
    // maxRetries: 3 explicitly, to prove non-idempotence wins over the budget.
    const eb = new EntryBit({ apiKey: "eb_sk_test", fetch: fn, maxRetries: 3 });
    await eb.org.doors.open({ controller_sn: "EB123456", door_no: 0 }).catch(() => undefined);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("opens and closes relays with bounded duration", async () => {
    const { fn, requests } = mockFetch({
      status: 202,
      body: { ...SENT, relay_no: 0, duration: 10 },
    });
    const eb = new EntryBit({ apiKey: "eb_sk_test", fetch: fn });
    await eb.org.relays.open({ controller_sn: "EB123456", relay_no: 0, duration: 10 });
    expect(requests[0]!.url).toContain("/api/v1/org/relays/open");
    await eb.org.relays.close({ controller_sn: "EB123456", relay_no: 0 });
    expect(requests[1]!.url).toContain("/api/v1/org/relays/close");
    expect(JSON.parse(requests[1]!.body ?? "{}")).toEqual({
      controller_sn: "EB123456",
      relay_no: 0,
    });
  });
});

describe("user-delegated access control", () => {
  it("lists controllers for the signed-in user", async () => {
    const { fn, requests } = mockFetch({ body: CONTROLLERS });
    const eb = new EntryBit({ accessToken: "tok_x", fetch: fn });
    const controllers = await eb.controllers.list();
    // The delegated path, NOT the org one.
    expect(requests[0]!.url).toBe("https://api.entrybit.net/api/v1/controllers");
    expect(controllers[0]!.sn).toBe("EB123456");
  });

  it("opens a door on the delegated path and never retries", async () => {
    const { fn, requests, spy } = mockFetch({ status: 503, body: {} });
    const eb = new EntryBit({ accessToken: "tok_x", fetch: fn, maxRetries: 3 });
    await eb.doors.open({ controller_sn: "EB123456", door_no: 0 }).catch(() => undefined);
    expect(requests[0]!.url).toBe("https://api.entrybit.net/api/v1/doors/open");
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("surfaces a missing controllers:manage permission as PermissionError", async () => {
    const { fn } = mockFetch({
      status: 403,
      body: { error: "insufficient_scope" },
      headers: { "WWW-Authenticate": 'Bearer error="insufficient_scope", scope="doors:open"' },
    });
    const eb = new EntryBit({ accessToken: "tok_x", fetch: fn });
    const err = await eb.doors
      .open({ controller_sn: "EB123456", door_no: 0 })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(PermissionError);
    expect((err as PermissionError).missingScope).toBe("doors:open");
  });

  it("caches the delegated namespaces", () => {
    const eb = new EntryBit({ apiKey: null });
    expect(eb.controllers).toBe(eb.controllers);
    expect(eb.doors).toBe(eb.doors);
  });
});

describe("org pass templates", () => {
  it("lists, upserts and deletes templates by name", async () => {
    const template = {
      name: "pool-guest",
      display: { show_code: false },
      created_at: "2026-07-31 12:00:00",
      updated_at: "2026-07-31 12:00:00",
    };
    const { fn, requests } = mockFetch(
      { body: { success: true, templates: [template] } },
      { body: { success: true, template } },
      { body: { success: true, deleted: "pool-guest" } },
    );
    const eb = new EntryBit({ apiKey: "eb_sk_test", fetch: fn });

    const templates = await eb.org.passTemplates.list();
    expect(templates[0]!.name).toBe("pool-guest");

    const saved = await eb.org.passTemplates.upsert("pool-guest", { show_code: false });
    expect(requests[1]!.method).toBe("PUT");
    expect(requests[1]!.url).toContain("/api/v1/org/pass-templates/pool-guest");
    expect(JSON.parse(requests[1]!.body ?? "{}")).toEqual({ display: { show_code: false } });
    expect(saved.display?.show_code).toBe(false);

    await eb.org.passTemplates.delete("pool-guest");
    expect(requests[2]!.method).toBe("DELETE");
  });

  it("caches the new lazy org namespaces", () => {
    const eb = new EntryBit({ apiKey: null });
    expect(eb.org.doors).toBe(eb.org.doors);
    expect(eb.org.controllers).toBe(eb.org.controllers);
    expect(eb.org.passTemplates).toBe(eb.org.passTemplates);
    expect(eb.org.relays).toBe(eb.org.relays);
  });
});
