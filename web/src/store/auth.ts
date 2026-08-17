// 极简登录状态管理（不需要引入 Pinia，演示项目够用）
import { reactive } from 'vue';

interface AuthState {
  token: string;
  username: string;
  role: string;
}

// 刷新页面后从 localStorage 恢复登录态
const saved = JSON.parse(localStorage.getItem('auth') || 'null') as AuthState | null;

export const auth = reactive<AuthState>({
  token: saved?.token || '',
  username: saved?.username || '',
  role: saved?.role || '',
});

export function saveAuth(data: AuthState) {
  auth.token = data.token;
  auth.username = data.username;
  auth.role = data.role;
  localStorage.setItem('auth', JSON.stringify(data));
}

export function clearAuth() {
  auth.token = '';
  auth.username = '';
  auth.role = '';
  localStorage.removeItem('auth');
}

export function isLoggedIn() {
  return !!auth.token;
}
