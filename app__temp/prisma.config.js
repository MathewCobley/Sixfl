const { defineConfig } = require("prisma/config");

module.exports = defineConfig({
  schema: "prisma/schema.prisma",
  migrate: {
    url: process.env.DATABASE_URL,
  },
});