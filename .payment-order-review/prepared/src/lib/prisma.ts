// ========================================
// File: src/lib/prisma.ts
// ========================================

import { FixtureStatus, Prisma, PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

const prismaClient =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === "development"
        ? ["query", "error", "warn"]
        : ["error"],
  });

async function assertFixtureIsNotCompleted(input: {
  where?: unknown;
  action: "update" | "delete";
}) {
  const where = input.where;

  if (!where || typeof where !== "object" || !("id" in where)) return;

  const id = (where as { id?: unknown }).id;
  if (typeof id !== "string" || !id.trim()) return;

  const existingFixture = await prismaClient.fixture.findUnique({
    where: { id },
    select: { status: true },
  });

  if (existingFixture?.status === FixtureStatus.COMPLETED) {
    throw new Error(
      input.action === "delete"
        ? "This fixture has already been completed and is locked, so it cannot be deleted."
        : "This fixture has already been completed and is locked, so it cannot be changed.",
    );
  }
}

async function assertNoCompletedFixturesInBulkAction(input: {
  where?: unknown;
  action: "update" | "delete";
}) {
  const where = input.where as Prisma.FixtureWhereInput | undefined;

  const completedFixture = await prismaClient.fixture.findFirst({
    where: {
      ...(where ?? {}),
      status: FixtureStatus.COMPLETED,
    },
    select: { id: true },
  });

  if (completedFixture) {
    throw new Error(
      input.action === "delete"
        ? "One or more completed fixtures are locked, so this delete cannot be applied."
        : "One or more completed fixtures are locked, so this update cannot be applied.",
    );
  }
}

export const prisma = prismaClient.$extends({
  query: {
    fixture: {
      async update({ args, query }) {
        await assertFixtureIsNotCompleted({
          where: args.where,
          action: "update",
        });
        return query(args);
      },
      async delete({ args, query }) {
        await assertFixtureIsNotCompleted({
          where: args.where,
          action: "delete",
        });
        return query(args);
      },
      async updateMany({ args, query }) {
        await assertNoCompletedFixturesInBulkAction({
          where: args.where,
          action: "update",
        });
        return query(args);
      },
      async deleteMany({ args, query }) {
        await assertNoCompletedFixturesInBulkAction({
          where: args.where,
          action: "delete",
        });
        return query(args);
      },
    },
  },
});

globalForPrisma.prisma = prismaClient;
