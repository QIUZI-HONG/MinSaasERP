import { PrismaClient } from '@prisma/client';

// 全局唯一 Prisma 客户端实例
export const prisma = new PrismaClient();
