# ============================================================
# MiniSaaS ERP 前端 Dockerfile（Nginx 托管构建产物 + API 反向代理）
# 构建: docker build -f web/Dockerfile -t minierp-web .
# ============================================================

# ---------- 阶段 1: 构建静态资源 ----------
FROM node:24-alpine AS builder

WORKDIR /app

COPY web/package*.json ./
RUN npm install --no-audit --no-fund

COPY web/ ./
RUN npm run build

# ---------- 阶段 2: Nginx 托管 ----------
FROM nginx:alpine

# 反代配置（SPA 路由回退 + /api 转发到后端服务）
COPY web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
