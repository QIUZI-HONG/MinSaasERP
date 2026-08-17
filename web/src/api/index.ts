// axios 封装：自动携带 token；401 时跳回登录页（登录接口自身的 401 除外）
import axios from 'axios';
import { auth, clearAuth } from '../store/auth';

export const http = axios.create({ baseURL: '/api' });

// 请求拦截：带上 JWT
http.interceptors.request.use((config) => {
  if (auth.token) {
    config.headers.Authorization = `Bearer ${auth.token}`;
  }
  return config;
});

// 响应拦截：
//  - 401：仅当「非登录接口」时才视为会话过期 → 清登录态并跳转。
//    登录接口自身的 401（密码错误）必须让业务代码拿到，才能正常弹出错误提示，
//    否则会触发整页刷新、提示被冲掉（P1 缺陷修复）。
http.interceptors.response.use(
  (res) => res,
  (err) => {
    const isAuthRequest = String(err.config?.url || '').includes('/auth/');
    if (err.response?.status === 401 && !isAuthRequest) {
      clearAuth();
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

// 所有接口方法集中在这里，页面组件只调用 api.xxx
export const api = {
  // 鉴权
  login: (data: { username: string; password: string }) => http.post('/auth/login', data),
  register: (data: { username: string; password: string }) => http.post('/auth/register', data),

  // 看板
  getStats: () => http.get('/dashboard/stats'),

  // 商品
  getProducts: (q?: string) => http.get('/products', { params: { q } }),
  createProduct: (data: unknown) => http.post('/products', data),
  updateProduct: (id: number, data: unknown) => http.put(`/products/${id}`, data),
  deleteProduct: (id: number) => http.delete(`/products/${id}`),

  // 客户
  getCustomers: () => http.get('/customers'),
  createCustomer: (data: unknown) => http.post('/customers', data),
  updateCustomer: (id: number, data: unknown) => http.put(`/customers/${id}`, data),
  deleteCustomer: (id: number) => http.delete(`/customers/${id}`),

  // 订单
  getOrders: () => http.get('/orders'),
  createOrder: (data: unknown) => http.post('/orders', data),
  updateOrderStatus: (id: number, status: string) => http.patch(`/orders/${id}/status`, { status }),
};
