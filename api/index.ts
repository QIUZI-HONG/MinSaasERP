// Vercel Serverless 入口：把 Express 应用包装为无服务器函数
// Vercel 构建时用 esbuild 编译本文件及其依赖（含 server/src/app.ts）
import serverless from 'serverless-http';
import { app } from '../server/src/app';

export const handler = serverless(app);
