<template>
  <div>
    <!-- 统计卡片 -->
    <el-row :gutter="16">
      <el-col v-for="card in cards" :key="card.label" :span="6">
        <el-card shadow="hover">
          <div class="stat-label">{{ card.label }}</div>
          <div class="stat-value">{{ card.value }}</div>
        </el-card>
      </el-col>
    </el-row>

    <!-- 最近订单 -->
    <el-card shadow="never" style="margin-top: 16px">
      <template #header>最近订单（最新 5 条）</template>
      <el-table :data="recentOrders" v-loading="loading" empty-text="暂无订单">
        <el-table-column prop="orderNo" label="订单号" width="180" />
        <el-table-column label="客户" min-width="180">
          <template #default="{ row }">{{ row.customer?.name }}</template>
        </el-table-column>
        <el-table-column label="金额" width="130">
          <template #default="{ row }">¥ {{ row.totalAmount.toFixed(2) }}</template>
        </el-table-column>
        <el-table-column label="状态" width="110">
          <template #default="{ row }">
            <el-tag :type="ORDER_STATUS[row.status]?.type || 'info'">
              {{ ORDER_STATUS[row.status]?.label || row.status }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="createdAt" label="创建时间" width="180" />
      </el-table>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { api } from '../api';
import { ORDER_STATUS } from '../constants';
import type { DashboardStats, Order } from '../types';

const loading = ref(false);
const stats = ref<DashboardStats>({
  productCount: 0,
  customerCount: 0,
  orderCount: 0,
  revenue: 0,
  recentOrders: [],
});
const recentOrders = ref<Order[]>([]);

const cards = computed(() => [
  { label: '商品总数', value: stats.value.productCount },
  { label: '客户总数', value: stats.value.customerCount },
  { label: '订单总数', value: stats.value.orderCount },
  { label: '累计营收（¥）', value: stats.value.revenue.toFixed(2) },
]);

onMounted(async () => {
  loading.value = true;
  try {
    const { data } = await api.getStats();
    stats.value = data;
    recentOrders.value = data.recentOrders || [];
  } catch {
    // 401 已由拦截器处理，这里静默即可
  } finally {
    loading.value = false;
  }
});
</script>

<style scoped>
.stat-label {
  font-size: 13px;
  color: #909399;
}
.stat-value {
  margin-top: 8px;
  font-size: 26px;
  font-weight: 600;
  color: #303133;
}
</style>
