// ========================================
// File: src/lib/kits/db.ts
// ========================================

import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";

import {
  TEAM_KIT_QUANTITY,
  type TeamKitOrderStatus,
  type TeamKitSize,
  type TeamKitSockSize,
} from "@/lib/kits/constants";
import { prisma } from "@/lib/prisma";

export type KitDesignSummary = {
  id: string;
  code: string;
  name: string | null;
  primaryColour: string | null;
  secondaryColour: string | null;
  style: string | null;
  isActive: boolean;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
};

export type KitDesignImage = {
  data: Uint8Array;
  mimeType: string;
  updatedAt: Date;
};

export type TeamKitOrderItem = {
  id: string;
  orderId: string;
  position: number;
  backName: string | null;
  shirtNumber: number;
  kitSize: TeamKitSize;
  sockSize: TeamKitSockSize;
  createdAt: Date;
  updatedAt: Date;
};

export type TeamKitOrder = {
  id: string;
  teamId: string;
  kitDesignId: string | null;
  status: TeamKitOrderStatus;
  kitQuantity: number;
  captainNotes: string | null;
  adminNotes: string | null;
  submittedByUserId: string | null;
  lastEditedByUserId: string | null;
  submittedAt: Date | null;
  approvedAt: Date | null;
  orderedAt: Date | null;
  fulfilledAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  design: KitDesignSummary | null;
  items: TeamKitOrderItem[];
};

export type AdminTeamKitOrder = TeamKitOrder & {
  teamName: string;
  leagueName: string | null;
  leagueSeason: string | null;
};

export type SaveTeamKitOrderItemInput = {
  position: number;
  backName: string | null;
  shirtNumber: number;
  kitSize: TeamKitSize;
  sockSize: TeamKitSockSize;
};

function cleanOptional(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed || null;
}

export function normaliseKitCode(value: string) {
  return value
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "-")
    .replace(/[^A-Z0-9_-]/g, "")
    .slice(0, 40);
}

function kitDesignColumns(alias = "design") {
  return Prisma.raw(`
    ${alias}."id",
    ${alias}."code",
    ${alias}."name",
    ${alias}."primaryColour",
    ${alias}."secondaryColour",
    ${alias}."style",
    ${alias}."isActive",
    ${alias}."sortOrder",
    ${alias}."createdAt",
    ${alias}."updatedAt"
  `);
}

export async function listKitDesigns(input?: { includeInactive?: boolean }) {
  if (input?.includeInactive) {
    return prisma.$queryRaw<KitDesignSummary[]>(Prisma.sql`
      SELECT ${kitDesignColumns("design")}
      FROM "KitDesign" AS design
      ORDER BY design."sortOrder" ASC, design."code" ASC
    `);
  }

  return prisma.$queryRaw<KitDesignSummary[]>(Prisma.sql`
    SELECT ${kitDesignColumns("design")}
    FROM "KitDesign" AS design
    WHERE design."isActive" = TRUE
    ORDER BY design."sortOrder" ASC, design."code" ASC
  `);
}

export async function getKitDesignById(
  id: string,
  input?: { includeInactive?: boolean },
) {
  const rows = input?.includeInactive
    ? await prisma.$queryRaw<KitDesignSummary[]>(Prisma.sql`
        SELECT ${kitDesignColumns("design")}
        FROM "KitDesign" AS design
        WHERE design."id" = ${id}
        LIMIT 1
      `)
    : await prisma.$queryRaw<KitDesignSummary[]>(Prisma.sql`
        SELECT ${kitDesignColumns("design")}
        FROM "KitDesign" AS design
        WHERE design."id" = ${id}
          AND design."isActive" = TRUE
        LIMIT 1
      `);

  return rows[0] ?? null;
}

export async function getKitDesignImage(
  id: string,
  variant: "thumbnail" | "full",
) {
  const rows =
    variant === "thumbnail"
      ? await prisma.$queryRaw<KitDesignImage[]>(Prisma.sql`
          SELECT
            "thumbnailData" AS "data",
            "thumbnailMimeType" AS "mimeType",
            "updatedAt"
          FROM "KitDesign"
          WHERE "id" = ${id}
          LIMIT 1
        `)
      : await prisma.$queryRaw<KitDesignImage[]>(Prisma.sql`
          SELECT
            "imageData" AS "data",
            "imageMimeType" AS "mimeType",
            "updatedAt"
          FROM "KitDesign"
          WHERE "id" = ${id}
          LIMIT 1
        `);

  return rows[0] ?? null;
}

export async function upsertKitDesignImage(input: {
  code: string;
  name?: string | null;
  imageData: Buffer;
  imageMimeType: string;
  thumbnailData: Buffer;
  thumbnailMimeType: string;
}) {
  const code = normaliseKitCode(input.code);
  if (!code) throw new Error("Kit code is required.");

  const maxRows = await prisma.$queryRaw<Array<{ maxSortOrder: number | null }>>(
    Prisma.sql`
      SELECT MAX("sortOrder") AS "maxSortOrder"
      FROM "KitDesign"
    `,
  );
  const nextSortOrder = (maxRows[0]?.maxSortOrder ?? 0) + 10;
  const id = randomUUID();

  const rows = await prisma.$queryRaw<KitDesignSummary[]>(Prisma.sql`
    INSERT INTO "KitDesign" (
      "id",
      "code",
      "name",
      "imageMimeType",
      "imageData",
      "thumbnailMimeType",
      "thumbnailData",
      "isActive",
      "sortOrder",
      "createdAt",
      "updatedAt"
    )
    VALUES (
      ${id},
      ${code},
      ${cleanOptional(input.name) ?? `Kit ${code}`},
      ${input.imageMimeType},
      ${input.imageData},
      ${input.thumbnailMimeType},
      ${input.thumbnailData},
      TRUE,
      ${nextSortOrder},
      NOW(),
      NOW()
    )
    ON CONFLICT ("code") DO UPDATE SET
      "name" = COALESCE(EXCLUDED."name", "KitDesign"."name"),
      "imageMimeType" = EXCLUDED."imageMimeType",
      "imageData" = EXCLUDED."imageData",
      "thumbnailMimeType" = EXCLUDED."thumbnailMimeType",
      "thumbnailData" = EXCLUDED."thumbnailData",
      "isActive" = TRUE,
      "updatedAt" = NOW()
    RETURNING
      "id",
      "code",
      "name",
      "primaryColour",
      "secondaryColour",
      "style",
      "isActive",
      "sortOrder",
      "createdAt",
      "updatedAt"
  `);

  return rows[0] ?? null;
}

export async function updateKitDesignMetadata(input: {
  id: string;
  code: string;
  name?: string | null;
  primaryColour?: string | null;
  secondaryColour?: string | null;
  style?: string | null;
  sortOrder: number;
  isActive: boolean;
}) {
  const code = normaliseKitCode(input.code);
  if (!code) throw new Error("Kit code is required.");

  const rows = await prisma.$queryRaw<KitDesignSummary[]>(Prisma.sql`
    UPDATE "KitDesign"
    SET
      "code" = ${code},
      "name" = ${cleanOptional(input.name)},
      "primaryColour" = ${cleanOptional(input.primaryColour)},
      "secondaryColour" = ${cleanOptional(input.secondaryColour)},
      "style" = ${cleanOptional(input.style)},
      "sortOrder" = ${input.sortOrder},
      "isActive" = ${input.isActive},
      "updatedAt" = NOW()
    WHERE "id" = ${input.id}
    RETURNING
      "id",
      "code",
      "name",
      "primaryColour",
      "secondaryColour",
      "style",
      "isActive",
      "sortOrder",
      "createdAt",
      "updatedAt"
  `);

  return rows[0] ?? null;
}

function mapOrderRows(
  orderRows: Array<
    Omit<TeamKitOrder, "design" | "items"> & {
      designId: string | null;
      designCode: string | null;
      designName: string | null;
      designPrimaryColour: string | null;
      designSecondaryColour: string | null;
      designStyle: string | null;
      designIsActive: boolean | null;
      designSortOrder: number | null;
      designCreatedAt: Date | null;
      designUpdatedAt: Date | null;
    }
  >,
  itemRows: TeamKitOrderItem[],
) {
  const itemsByOrder = new Map<string, TeamKitOrderItem[]>();
  for (const item of itemRows) {
    const current = itemsByOrder.get(item.orderId) ?? [];
    current.push(item);
    itemsByOrder.set(item.orderId, current);
  }

  return orderRows.map<TeamKitOrder>((row) => ({
    id: row.id,
    teamId: row.teamId,
    kitDesignId: row.kitDesignId,
    status: row.status,
    kitQuantity: row.kitQuantity,
    captainNotes: row.captainNotes,
    adminNotes: row.adminNotes,
    submittedByUserId: row.submittedByUserId,
    lastEditedByUserId: row.lastEditedByUserId,
    submittedAt: row.submittedAt,
    approvedAt: row.approvedAt,
    orderedAt: row.orderedAt,
    fulfilledAt: row.fulfilledAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    design: row.designId
      ? {
          id: row.designId,
          code: row.designCode ?? "Unknown",
          name: row.designName,
          primaryColour: row.designPrimaryColour,
          secondaryColour: row.designSecondaryColour,
          style: row.designStyle,
          isActive: row.designIsActive ?? false,
          sortOrder: row.designSortOrder ?? 0,
          createdAt: row.designCreatedAt ?? row.createdAt,
          updatedAt: row.designUpdatedAt ?? row.updatedAt,
        }
      : null,
    items: (itemsByOrder.get(row.id) ?? []).sort(
      (left, right) => left.position - right.position,
    ),
  }));
}

const orderSelect = Prisma.raw(`
  orders."id",
  orders."teamId",
  orders."kitDesignId",
  orders."status",
  orders."kitQuantity",
  orders."captainNotes",
  orders."adminNotes",
  orders."submittedByUserId",
  orders."lastEditedByUserId",
  orders."submittedAt",
  orders."approvedAt",
  orders."orderedAt",
  orders."fulfilledAt",
  orders."createdAt",
  orders."updatedAt",
  design."id" AS "designId",
  design."code" AS "designCode",
  design."name" AS "designName",
  design."primaryColour" AS "designPrimaryColour",
  design."secondaryColour" AS "designSecondaryColour",
  design."style" AS "designStyle",
  design."isActive" AS "designIsActive",
  design."sortOrder" AS "designSortOrder",
  design."createdAt" AS "designCreatedAt",
  design."updatedAt" AS "designUpdatedAt"
`);

type OrderSelectRow = Omit<TeamKitOrder, "design" | "items"> & {
  designId: string | null;
  designCode: string | null;
  designName: string | null;
  designPrimaryColour: string | null;
  designSecondaryColour: string | null;
  designStyle: string | null;
  designIsActive: boolean | null;
  designSortOrder: number | null;
  designCreatedAt: Date | null;
  designUpdatedAt: Date | null;
};

async function getOrderItems(orderIds: string[]) {
  if (orderIds.length === 0) return [];

  return prisma.$queryRaw<TeamKitOrderItem[]>(Prisma.sql`
    SELECT
      "id",
      "orderId",
      "position",
      "backName",
      "shirtNumber",
      "kitSize",
      "sockSize",
      "createdAt",
      "updatedAt"
    FROM "TeamKitOrderItem"
    WHERE "orderId" IN (${Prisma.join(orderIds)})
    ORDER BY "orderId" ASC, "position" ASC
  `);
}

export async function getTeamKitOrder(teamId: string) {
  const rows = await prisma.$queryRaw<OrderSelectRow[]>(Prisma.sql`
    SELECT ${orderSelect}
    FROM "TeamKitOrder" AS orders
    LEFT JOIN "KitDesign" AS design
      ON design."id" = orders."kitDesignId"
    WHERE orders."teamId" = ${teamId}
    LIMIT 1
  `);

  if (!rows[0]) return null;
  const items = await getOrderItems([rows[0].id]);
  return mapOrderRows(rows, items)[0] ?? null;
}

export async function saveTeamKitOrder(input: {
  teamId: string;
  kitDesignId: string;
  captainNotes?: string | null;
  status: "DRAFT" | "SUBMITTED";
  editedByUserId?: string | null;
  items: SaveTeamKitOrderItemInput[];
}) {
  if (input.items.length !== TEAM_KIT_QUANTITY) {
    throw new Error(`Exactly ${TEAM_KIT_QUANTITY} kit entries are required.`);
  }

  return prisma.$transaction(async (tx) => {
    const designRows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT "id"
      FROM "KitDesign"
      WHERE "id" = ${input.kitDesignId}
        AND "isActive" = TRUE
      LIMIT 1
    `);
    if (!designRows[0]) throw new Error("Selected kit design is unavailable.");

    const existingRows = await tx.$queryRaw<
      Array<{ id: string; status: TeamKitOrderStatus }>
    >(Prisma.sql`
      SELECT "id", "status"
      FROM "TeamKitOrder"
      WHERE "teamId" = ${input.teamId}
      FOR UPDATE
    `);

    const existing = existingRows[0] ?? null;
    const orderId = existing?.id ?? randomUUID();
    const now = new Date();

    if (existing) {
      await tx.$executeRaw(Prisma.sql`
        UPDATE "TeamKitOrder"
        SET
          "kitDesignId" = ${input.kitDesignId},
          "status" = ${input.status}::"TeamKitOrderStatus",
          "kitQuantity" = ${TEAM_KIT_QUANTITY},
          "captainNotes" = ${cleanOptional(input.captainNotes)},
          "submittedByUserId" = CASE
            WHEN ${input.status} = 'SUBMITTED'
              THEN ${cleanOptional(input.editedByUserId)}
            ELSE "submittedByUserId"
          END,
          "lastEditedByUserId" = ${cleanOptional(input.editedByUserId)},
          "submittedAt" = CASE
            WHEN ${input.status} = 'SUBMITTED' THEN ${now}
            ELSE NULL
          END,
          "approvedAt" = NULL,
          "orderedAt" = NULL,
          "fulfilledAt" = NULL,
          "updatedAt" = ${now}
        WHERE "id" = ${orderId}
      `);
    } else {
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO "TeamKitOrder" (
          "id",
          "teamId",
          "kitDesignId",
          "status",
          "kitQuantity",
          "captainNotes",
          "submittedByUserId",
          "lastEditedByUserId",
          "submittedAt",
          "createdAt",
          "updatedAt"
        )
        VALUES (
          ${orderId},
          ${input.teamId},
          ${input.kitDesignId},
          ${input.status}::"TeamKitOrderStatus",
          ${TEAM_KIT_QUANTITY},
          ${cleanOptional(input.captainNotes)},
          ${input.status === "SUBMITTED"
            ? cleanOptional(input.editedByUserId)
            : null},
          ${cleanOptional(input.editedByUserId)},
          ${input.status === "SUBMITTED" ? now : null},
          ${now},
          ${now}
        )
      `);
    }

    await tx.$executeRaw(Prisma.sql`
      DELETE FROM "TeamKitOrderItem"
      WHERE "orderId" = ${orderId}
    `);

    for (const item of input.items) {
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO "TeamKitOrderItem" (
          "id",
          "orderId",
          "position",
          "backName",
          "shirtNumber",
          "kitSize",
          "sockSize",
          "createdAt",
          "updatedAt"
        )
        VALUES (
          ${randomUUID()},
          ${orderId},
          ${item.position},
          ${cleanOptional(item.backName)},
          ${item.shirtNumber},
          ${item.kitSize}::"TeamKitSize",
          ${item.sockSize}::"TeamKitSockSize",
          ${now},
          ${now}
        )
      `);
    }

    return orderId;
  });
}

export async function listAdminTeamKitOrders() {
  type AdminOrderRow = OrderSelectRow & {
    teamName: string;
    leagueName: string | null;
    leagueSeason: string | null;
  };

  const rows = await prisma.$queryRaw<AdminOrderRow[]>(Prisma.sql`
    SELECT
      ${orderSelect},
      team."name" AS "teamName",
      league."name" AS "leagueName",
      league."season" AS "leagueSeason"
    FROM "TeamKitOrder" AS orders
    INNER JOIN "Team" AS team
      ON team."id" = orders."teamId"
    LEFT JOIN "League" AS league
      ON league."id" = team."leagueId"
    LEFT JOIN "KitDesign" AS design
      ON design."id" = orders."kitDesignId"
    ORDER BY
      CASE orders."status"
        WHEN 'SUBMITTED' THEN 0
        WHEN 'APPROVED' THEN 1
        WHEN 'ORDERED' THEN 2
        WHEN 'DRAFT' THEN 3
        WHEN 'FULFILLED' THEN 4
        ELSE 5
      END ASC,
      orders."updatedAt" DESC
  `);

  const items = await getOrderItems(rows.map((row) => row.id));
  const mapped = mapOrderRows(rows, items);

  return mapped.map<AdminTeamKitOrder>((order, index) => ({
    ...order,
    teamName: rows[index]?.teamName ?? "Unknown team",
    leagueName: rows[index]?.leagueName ?? null,
    leagueSeason: rows[index]?.leagueSeason ?? null,
  }));
}

export async function updateTeamKitOrderAdminNotes(input: {
  orderId: string;
  adminNotes?: string | null;
  editedByUserId?: string | null;
}) {
  return prisma.$executeRaw(Prisma.sql`
    UPDATE "TeamKitOrder"
    SET
      "adminNotes" = ${cleanOptional(input.adminNotes)},
      "lastEditedByUserId" = ${cleanOptional(input.editedByUserId)},
      "updatedAt" = NOW()
    WHERE "id" = ${input.orderId}
  `);
}

export async function updateTeamKitOrderStatus(input: {
  orderId: string;
  status: TeamKitOrderStatus;
  editedByUserId?: string | null;
}) {
  const editedByUserId = cleanOptional(input.editedByUserId);

  switch (input.status) {
    case "DRAFT":
      return prisma.$executeRaw(Prisma.sql`
        UPDATE "TeamKitOrder"
        SET
          "status" = 'DRAFT',
          "submittedAt" = NULL,
          "approvedAt" = NULL,
          "orderedAt" = NULL,
          "fulfilledAt" = NULL,
          "lastEditedByUserId" = ${editedByUserId},
          "updatedAt" = NOW()
        WHERE "id" = ${input.orderId}
      `);
    case "SUBMITTED":
      return prisma.$executeRaw(Prisma.sql`
        UPDATE "TeamKitOrder"
        SET
          "status" = 'SUBMITTED',
          "submittedAt" = COALESCE("submittedAt", NOW()),
          "approvedAt" = NULL,
          "orderedAt" = NULL,
          "fulfilledAt" = NULL,
          "lastEditedByUserId" = ${editedByUserId},
          "updatedAt" = NOW()
        WHERE "id" = ${input.orderId}
      `);
    case "APPROVED":
      return prisma.$executeRaw(Prisma.sql`
        UPDATE "TeamKitOrder"
        SET
          "status" = 'APPROVED',
          "submittedAt" = COALESCE("submittedAt", NOW()),
          "approvedAt" = NOW(),
          "orderedAt" = NULL,
          "fulfilledAt" = NULL,
          "lastEditedByUserId" = ${editedByUserId},
          "updatedAt" = NOW()
        WHERE "id" = ${input.orderId}
      `);
    case "ORDERED":
      return prisma.$executeRaw(Prisma.sql`
        UPDATE "TeamKitOrder"
        SET
          "status" = 'ORDERED',
          "submittedAt" = COALESCE("submittedAt", NOW()),
          "approvedAt" = COALESCE("approvedAt", NOW()),
          "orderedAt" = NOW(),
          "fulfilledAt" = NULL,
          "lastEditedByUserId" = ${editedByUserId},
          "updatedAt" = NOW()
        WHERE "id" = ${input.orderId}
      `);
    case "FULFILLED":
      return prisma.$executeRaw(Prisma.sql`
        UPDATE "TeamKitOrder"
        SET
          "status" = 'FULFILLED',
          "submittedAt" = COALESCE("submittedAt", NOW()),
          "approvedAt" = COALESCE("approvedAt", NOW()),
          "orderedAt" = COALESCE("orderedAt", NOW()),
          "fulfilledAt" = NOW(),
          "lastEditedByUserId" = ${editedByUserId},
          "updatedAt" = NOW()
        WHERE "id" = ${input.orderId}
      `);
    case "CANCELLED":
      return prisma.$executeRaw(Prisma.sql`
        UPDATE "TeamKitOrder"
        SET
          "status" = 'CANCELLED',
          "lastEditedByUserId" = ${editedByUserId},
          "updatedAt" = NOW()
        WHERE "id" = ${input.orderId}
      `);
  }
}

export async function getTeamKitOrderExportRows() {
  return prisma.$queryRaw<
    Array<{
      orderId: string;
      teamName: string;
      leagueName: string | null;
      status: TeamKitOrderStatus;
      kitCode: string | null;
      kitName: string | null;
      position: number;
      backName: string | null;
      shirtNumber: number;
      kitSize: TeamKitSize;
      sockSize: TeamKitSockSize;
      submittedAt: Date | null;
      adminNotes: string | null;
    }>
  >(Prisma.sql`
    SELECT
      orders."id" AS "orderId",
      team."name" AS "teamName",
      league."name" AS "leagueName",
      orders."status",
      design."code" AS "kitCode",
      design."name" AS "kitName",
      items."position",
      items."backName",
      items."shirtNumber",
      items."kitSize",
      items."sockSize",
      orders."submittedAt",
      orders."adminNotes"
    FROM "TeamKitOrder" AS orders
    INNER JOIN "Team" AS team
      ON team."id" = orders."teamId"
    LEFT JOIN "League" AS league
      ON league."id" = team."leagueId"
    LEFT JOIN "KitDesign" AS design
      ON design."id" = orders."kitDesignId"
    INNER JOIN "TeamKitOrderItem" AS items
      ON items."orderId" = orders."id"
    ORDER BY team."name" ASC, items."position" ASC
  `);
}
