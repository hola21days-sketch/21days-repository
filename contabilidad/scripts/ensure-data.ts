/**
 * Si la base de datos esta vacia, carga el Excel. Asi `npm run dev` funciona
 * en un clon recien hecho sin pasos extra.
 */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

async function main() {
  const n = await db.movement.count();
  await db.$disconnect();
  if (n > 0) return;
  console.log("Base de datos vacia — importando el Excel...");
  await import("./import-excel");
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
