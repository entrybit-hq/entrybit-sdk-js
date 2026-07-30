/**
 * Server-to-server example: list the member directory and create a guest
 * pass using an organization API key.
 *
 * Run with: ENTRYBIT_API_KEY=eb_sk_... npx tsx examples/org-api-key.ts
 */
import { EntryBit, PermissionError, RateLimitError } from "@entrybit/sdk";

// Reads ENTRYBIT_API_KEY from the environment automatically.
const entrybit = new EntryBit();

try {
  // Walk the whole member directory (cursor pagination handled for you).
  for await (const member of entrybit.org.members.iterate({ fields: ["name", "department"] })) {
    console.log(member.name, "—", member.department ?? "no department");
  }

  // Create a guest pass — the guest receives it by email and/or SMS.
  const facilities = await entrybit.org.facilities.list();
  const created = await entrybit.org.passes.create({
    first_name: "Dana",
    last_name: "Levy",
    email: "dana@example.com",
    arrival_date: "2026-08-12",
    facility_id: facilities[0]!.id!,
  });
  console.log("Pass created:", created.public_id);
} catch (err) {
  if (err instanceof PermissionError) {
    console.error("The API key is missing a scope:", err.missingScope);
  } else if (err instanceof RateLimitError) {
    console.error("Rate limited; retry in", err.retryAfter ?? "a few", "seconds");
  } else {
    throw err;
  }
}
