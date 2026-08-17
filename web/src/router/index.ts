// 路由配置 + 登录守卫
import { createRouter, createWebHistory } from 'vue-router';
import { isLoggedIn } from '../store/auth';

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/login',
      component: () => import('../views/LoginView.vue'),
    },
    {
      path: '/',
      component: () => import('../views/LayoutView.vue'),
      redirect: '/dashboard',
      children: [
        {
          path: 'dashboard',
          component: () => import('../views/DashboardView.vue'),
          meta: { title: '数据看板' },
        },
        {
          path: 'products',
          component: () => import('../views/ProductsView.vue'),
          meta: { title: '商品管理' },
        },
        {
          path: 'customers',
          component: () => import('../views/CustomersView.vue'),
          meta: { title: '客户管理' },
        },
        {
          path: 'orders',
          component: () => import('../views/OrdersView.vue'),
          meta: { title: '订单管理' },
        },
      ],
    },
  ],
});

// 全局前置守卫：未登录只能去登录页
router.beforeEach((to) => {
  if (to.path !== '/login' && !isLoggedIn()) return '/login';
  if (to.path === '/login' && isLoggedIn()) return '/';
  return true;
});

export default router;
