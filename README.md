# MiniSaaS ERP（迷你 SaaS 进销存系统）

> 面试演示项目 —— 对应"AI 全栈工程师（SaaS 方向）"岗位：Node.js + TypeScript + Prisma + SQL 后端 × Vue 3 + TypeScript + Vite 前端，全链路由 AI 辅助完成。

## 一、项目简介

一个多租户风格的迷你 SaaS ERP 演示系统，覆盖**商品、客户、订单、数据看板**四大业务模块：

- 登录鉴权：JWT + bcrypt 密码哈希
- 商品管理：增删改查 + 按名称/SKU 搜索
- 客户管理：增删改查
- 订单管理：下单（**事务扣减库存**）、明细展开、状态流转（**取消订单自动回补库存**）
- 数据看板：商品/客户/订单总数、累计营收、最近订单

## 二、技术栈

| 层 | 技术 |
| --- | --- |
| 后端 | Node.js + TypeScript + Express + Prisma ORM + SQLite |
| 前端 | Vue 3 + TypeScript + Vite + Element Plus + Vue Router + Axios |
| 鉴权 | JWT（jsonwebtoken）+ bcryptjs |
| 数据 | SQLite 单文件数据库（生产可平滑切换 PostgreSQL/MySQL） |

## 三、目录结构

```
├── server/                  # 后端
│   ├── prisma/
│   │   ├── schema.prisma    # 数据模型（5 张表）
│   │   └── seed.ts          # 演示数据
│   └── src/
│       ├── index.ts         # 入口：中间件 + 路由挂载 + 统一错误处理
│       ├── db.ts            # Prisma 客户端
│       ├── errors.ts        # 业务错误类
│       ├── middleware/auth.ts  # JWT 签发 + 鉴权中间件
│       └── routes/          # auth / products / customers / orders / dashboard
└── web/                     # 前端
    └── src/
        ├── api/index.ts     # axios 封装（自动带 token、401 拦截）
        ├── router/          # 路由 + 登录守卫
        ├── store/auth.ts    # 登录状态
        ├── constants.ts     # 订单状态字典
        └── views/           # 登录 / 布局 / 看板 / 商品 / 客户 / 订单
```

## 四、快速启动

> 需要 Node.js 18+（本机已验证 v24）。

### 1. 启动后端（终端 A）

```bash
cd server
npm install
npx prisma db push        # 建表（在 prisma/dev.db 生成数据库）
npm run db:seed           # 写入演示数据
npm run dev               # 启动，监听 http://localhost:3000
```

看到 `✅ MiniSaaS ERP API 已启动` 即成功。

### 2. 启动前端（终端 B）

```bash
cd web
npm install
npm run dev               # 启动，打开 http://localhost:5173
```

### 3. 登录

- 账号：`admin`
- 密码：`admin123`

> 前端开发服务器已配置代理：页面里的 `/api` 请求会自动转发到 `http://localhost:3000`，无需处理跨域。

## 五、API 一览

| 方法 | 路径 | 说明 | 鉴权 |
| --- | --- | --- | --- |
| POST | `/api/auth/login` | 登录，返回 JWT | 否 |
| POST | `/api/auth/register` | 注册 | 否 |
| GET | `/api/dashboard/stats` | 看板统计 | 是 |
| GET | `/api/products?q=` | 商品列表（可搜索） | 是 |
| POST | `/api/products` | 新增商品 | 是 |
| PUT | `/api/products/:id` | 修改商品 | 是 |
| DELETE | `/api/products/:id` | 删除商品 | 是 |
| GET | `/api/customers` | 客户列表 | 是 |
| POST | `/api/customers` | 新增客户 | 是 |
| PUT | `/api/customers/:id` | 修改客户 | 是 |
| DELETE | `/api/customers/:id` | 删除客户 | 是 |
| GET | `/api/orders` | 订单列表 | 是 |
| POST | `/api/orders` | 创建订单（扣库存） | 是 |
| PATCH | `/api/orders/:id/status` | 更新订单状态 | 是 |

请求头：`Authorization: Bearer <token>`

## 六、数据模型（5 张表）

```
User（用户）1 ── n Order（订单）n ── 1 Customer（客户）
Order（订单）1 ── n OrderItem（明细）n ── 1 Product（商品）
```

设计要点：

- `OrderItem.unitPrice` 保存**下单时单价快照**，商品改价不影响历史订单
- `Order.status` 状态机：`PENDING → PAID → SHIPPED → DONE`，可 `CANCELLED` 取消
- 下单与取消都在 **Prisma 事务**中完成，保证"扣库存"与"回补库存"与订单写入原子一致

## 七、演示亮点（面试时重点讲）

1. **AI 辅助全流程开发**：从模型设计、接口编写、前端页面到排错全程用 AI 工具（Cursor/Claude）生成，并逐段审查修正
2. **数据一致性**：订单创建用 `$transaction` 事务扣减库存；取消订单回补库存；金额由后端计算而非信任前端
3. **质量兜底**：统一错误处理（业务错误 400 / 其他 500）、外键约束保护（被订单引用的商品/客户不允许删除）、JWT 鉴权中间件
4. **工程化**：TypeScript 严格模式、Prisma Schema 作为"数据库即代码"、axios 拦截器统一处理 401

## 八、已知简化（被问到时诚实说明）

- 数据库用 SQLite 单文件（演示方便）；生产换成 PostgreSQL 只需改 `schema.prisma` 一行 + 连接串
- 未做分页/权限细粒度控制/单元测试（演示范围），但架构上已留出扩展点
- 前端状态管理用轻量 reactive 而非 Pinia（演示够用，可低成本替换）
