import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/client.js';

let prisma: PrismaClient | undefined;
let adapter: PrismaPg | undefined;

export function getPrisma(): PrismaClient {
  if (!prisma) {
    adapter = new PrismaPg({ connectionString: process.env['DATABASE_URL'] });
    prisma = new PrismaClient({ adapter });
  }
  return prisma;
}

export async function closePrisma(): Promise<void> {
  if (prisma) {
    await prisma.$disconnect();
    prisma = undefined;
    adapter = undefined;
  }
}
