# ============================================================
# MiniSaaS ERP 后端 Dockerfile（多阶段构建）
# 构建: docker build -f server/Dockerfile -t minierp-server .
# 运行: docker run -p 3000:3000 minierp-server
# ============================================================

# ---------- 阶段 1: 安装依赖 + 构建 ----------
FROM node:24-alpine AS builder

WORKDIR /app

# 先复制清单文件，充分利用层缓存
COPY server/package*.json ./
COPY server/prisma ./prisma

# Prisma 需要生成客户端，需在安装后执行
RUN npm install --no-audit --no-fund && npx prisma generate

COPY server/tsconfig.json ./
COPY server/src ./src

RUN npm run build

# ---------- 阶段 2: 精简运行镜像 ----------
FROM node:24-alpine AS runtime

WORKDIR /app
ENV NODE_ENV=production

# 仅复制生产依赖
COPY server/package*.json ./
RUN npm install --omit=dev --no-audit --no-fund && npx prisma generate

COPY --from=builder /app/dist ./dist
COPY server/prisma ./prisma

# 健康检查
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3000/api/health || exit 1

EXPOSE 3000

CMD ["node", "dist/index.js"]
