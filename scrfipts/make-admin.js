const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

async function main() {
  const email = "hello@sixfl.co.uk"; // change if needed

  const user = await prisma.user.findUnique({
    where: { email },
  });

  if (!user) {
    console.log(`No user found for ${email}`);
    return;
  }

  await prisma.user.update({
    where: { email },
    data: { role: "ADMIN" },
  });

  console.log(`${email} is now ADMIN`);
}

main()
  .catch((err) => {
    console.error(err);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });