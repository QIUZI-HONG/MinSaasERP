<template>
  <div class="login-wrap">
    <el-card class="login-card">
      <template #header>
        <div class="login-title">MiniSaaS ERP</div>
        <div class="login-subtitle">多租户 SaaS 进销存管理系统 · 面试演示项目</div>
      </template>
      <el-form :model="form" @submit.prevent="onSubmit">
        <el-form-item>
          <el-input v-model="form.username" placeholder="用户名" size="large" />
        </el-form-item>
        <el-form-item>
          <el-input
            v-model="form.password"
            type="password"
            placeholder="密码"
            size="large"
            show-password
            @keyup.enter="onSubmit"
          />
        </el-form-item>
        <el-button
          type="primary"
          size="large"
          style="width: 100%"
          :loading="loading"
          @click="onSubmit"
        >
          登 录
        </el-button>
      </el-form>
      <div class="login-tip">演示账号：admin / admin123</div>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { api } from '../api';
import { saveAuth } from '../store/auth';

const router = useRouter();
const form = reactive({ username: 'admin', password: 'admin123' });
const loading = ref(false);

async function onSubmit() {
  if (!form.username || !form.password) {
    ElMessage.warning('请输入用户名和密码');
    return;
  }
  loading.value = true;
  try {
    const { data } = await api.login(form);
    saveAuth({ token: data.token, username: data.user.username, role: data.user.role });
    ElMessage.success('登录成功');
    router.push('/');
  } catch (e: any) {
    ElMessage.error(e.response?.data?.message || '登录失败，请检查网络或后端服务');
  } finally {
    loading.value = false;
  }
}
</script>

<style scoped>
.login-wrap {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #1f3b73 0%, #2d5aa8 100%);
}
.login-card {
  width: 400px;
  border-radius: 8px;
}
.login-title {
  font-size: 22px;
  font-weight: 600;
  text-align: center;
  color: #303133;
}
.login-subtitle {
  margin-top: 6px;
  font-size: 12px;
  text-align: center;
  color: #909399;
}
.login-tip {
  margin-top: 16px;
  text-align: center;
  color: #909399;
  font-size: 13px;
}
</style>
