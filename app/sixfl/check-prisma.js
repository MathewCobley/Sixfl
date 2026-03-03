const { PrismaClient } = require("@prisma/client");

(async () => {
  const p = new PrismaClient();
  console.log("MODEL KEYS:", Object.keys(p).filter(k => !k.startsWith("$")));
  await p.$disconnect();
})().catch((e) => {
  console.error("ERROR:", e);
  process.exit(1);
});
