import { performance } from "perf_hooks";

const TEST_ACCOUNTS = [
  {
    role: "admin" as const,
    email: "emilynnj14@gmail.com",
    fullName: "Emilynn (Admin)",
    username: "emilynn-admin",
  },
  {
    role: "reader" as const,
    email: "emilynn992@gmail.com",
    fullName: "Emilynn",
    username: "emilynn",
    pricingChat: 299,
    pricingVoice: 399,
    pricingVideo: 499,
    bio: "Test reader account for QA.",
    specialties: "Tarot, Clairvoyance, Mediumship",
  },
  {
    role: "client" as const,
    email: "emily81292@gmail.com",
    fullName: "Emily",
    username: "emily",
    startingBalanceCents: 5000,
  },
];

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function mockUpsertUserWithPassword() {
  await sleep(100);
  return { auth0Id: "auth0|123", created: true };
}

async function mockDbExisting() {
  await sleep(50);
  return [null];
}

async function mockDbInsert() {
  await sleep(50);
  return [{ id: 1 }];
}

async function runBenchmark() {
  const passwordByRole: Record<string, string> = {
    admin: "adminPassword",
    reader: "readerPassword",
    client: "clientPassword",
  };

  const results: Array<{
    email: string;
    role: string;
    auth0Created: boolean;
    dbAction: "inserted" | "updated";
  }> = [];

  const start = performance.now();

  const concurrentResults = await Promise.all(
    TEST_ACCOUNTS.map(async (spec) => {
      const upsert = await mockUpsertUserWithPassword();

      const patch = {
        email: spec.email,
        username: spec.username ?? null,
        fullName: spec.fullName,
        role: spec.role,
        bio: "bio" in spec ? spec.bio ?? null : null,
        specialties: "specialties" in spec ? spec.specialties ?? null : null,
        pricingChat: "pricingChat" in spec ? spec.pricingChat ?? 0 : 0,
        pricingVoice: "pricingVoice" in spec ? spec.pricingVoice ?? 0 : 0,
        pricingVideo: "pricingVideo" in spec ? spec.pricingVideo ?? 0 : 0,
        balance: "startingBalanceCents" in spec ? spec.startingBalanceCents ?? 0 : 0,
        updatedAt: new Date(),
      };

      const existing = await mockDbExisting();

      if (existing[0]) {
        // await db.update...
        await sleep(50);
        return {
          email: spec.email,
          role: spec.role,
          auth0Created: upsert.created,
          dbAction: "updated" as const,
        };
      } else {
        await mockDbInsert();
        return {
          email: spec.email,
          role: spec.role,
          auth0Created: upsert.created,
          dbAction: "inserted" as const,
        };
      }
    }),
  );

  const end = performance.now();
  console.log(`Execution time: ${(end - start).toFixed(2)} ms`);
}

runBenchmark().catch(console.error);
