const fs = require("node:fs");
const path = require("node:path");

const filePath = path.join(
  process.cwd(),
  "src",
  "app",
  "(public)",
  "referee",
  "actions.ts",
);

let source = fs.readFileSync(filePath, "utf8");

const before = `export async function submitNightFixtureResultAction(formData: FormData) {
  const { user } = await requireReferee();

  const refereeNightId = parseRequiredString(formData.get("refereeNightId"), "Referee night");
  const fixtureId = parseRequiredString(formData.get("fixtureId"), "Fixture");
  const homeScore = parseScore(formData.get("homeScore"), "Home score");
  const awayScore = parseScore(formData.get("awayScore"), "Away score");

  await assertNightAccess({ refereeNightId, fixtureId, user });

  await prisma.$transaction(async (tx) => {
    await tx.matchResult.upsert({
      where: { fixtureId },
      update: {
        homeScore,
        awayScore,
        enteredByUserId: user.id,
        enteredAt: new Date(),
        isDisputed: false,
        disputeNote: null,
      },
      create: {
        fixtureId,
        homeScore,
        awayScore,
        enteredByUserId: user.id,
        enteredAt: new Date(),
      },
    });

    await tx.fixture.update({
      where: { id: fixtureId },
      data: { status: FixtureStatus.COMPLETED },
    });
  });

  revalidatePath("/referee");
  revalidatePath(\`/referee/night/\${refereeNightId}\`);
  revalidatePath(\`/admin/referee-nights/\${refereeNightId}\`);
  revalidatePath("/admin/fixtures");

  redirect(\`/referee/night/\${refereeNightId}?saved=result\`);
}`;

const after = `export async function submitNightFixtureResultAction(formData: FormData) {
  const { user } = await requireReferee();

  const refereeNightId = parseRequiredString(formData.get("refereeNightId"), "Referee night");
  const fixtureId = parseRequiredString(formData.get("fixtureId"), "Fixture");
  const homeScore = parseScore(formData.get("homeScore"), "Home score");
  const awayScore = parseScore(formData.get("awayScore"), "Away score");

  await assertNightAccess({ refereeNightId, fixtureId, user });

  const fixture = await prisma.fixture.findUnique({
    where: { id: fixtureId },
    select: {
      status: true,
      result: { select: { id: true } },
    },
  });

  if (!fixture) throw new Error("Fixture not found.");

  await prisma.$transaction(async (tx) => {
    if (fixture.result) {
      await tx.matchResult.update({
        where: { fixtureId },
        data: {
          homeScore,
          awayScore,
          enteredByUserId: user.id,
          enteredAt: new Date(),
          isDisputed: false,
          disputeNote: null,
        },
      });
    } else {
      await tx.matchResult.create({
        data: {
          fixtureId,
          homeScore,
          awayScore,
          enteredByUserId: user.id,
          enteredAt: new Date(),
          isDisputed: false,
          disputeNote: null,
        },
      });
    }

    if (fixture.status !== FixtureStatus.COMPLETED) {
      await tx.fixture.update({
        where: { id: fixtureId },
        data: { status: FixtureStatus.COMPLETED },
      });
    }
  });

  revalidatePath("/referee");
  revalidatePath(\`/referee/night/\${refereeNightId}\`);
  revalidatePath(\`/admin/referee-nights/\${refereeNightId}\`);
  revalidatePath("/admin/fixtures");

  redirect(\`/referee/night/\${refereeNightId}?saved=result\`);
}`;

if (source.includes("if (fixture.result) {\n      await tx.matchResult.update")) {
  console.log("Referee night score update fix already applied.");
  process.exit(0);
}

if (!source.includes(before)) {
  throw new Error("Expected referee night score action source was not found.");
}

source = source.replace(before, after);
fs.writeFileSync(filePath, source, "utf8");

console.log("Applied referee night score update fix.");
