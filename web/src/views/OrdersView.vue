<template>
  <el-card shadow="never">
    <div class="toolbar">
      <span></span>
      <el-button type="primary" @click="openCreate">新建订单</el-button>
    </div>

    <!-- 订单列表：可展开查看明细 -->
    <el-table :data="list" v-loading="loading" border empty-text="暂无订单">
      <el-table-column type="expand">
        <template #default="{ row }">
          <el-table :data="row.items" size="small" border>
            <el-table-column prop="product.name" label="商品" min-width="180" />
            <el-table-column prop="product.sku" label="SKU" width="120" />
            <el-table-column label="单价" width="120">
              <template #default="{ row: it }">¥ {{ it.unitPrice.toFixed(2) }}</template>
            </el-table-column>
            <el-table-column prop="quantity" label="数量" width="90" />
            <el-table-column label="小计" width="130">
              <template #default="{ row: it }">
                ¥ {{ (it.unitPrice * it.quantity).toFixed(2) }}
              </template>
            </el-table-column>
          </el-table>
        </template>
      </el-table-column>
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
      <el-table-column prop="createdAt" label="创建时间" width="175" />
      <el-table-column label="操作" width="130" fixed="right">
        <template #default="{ row }">
          <el-dropdown
            v-if="STATUS_FLOW[row.status]?.length"
            @command="(cmd) => onChangeStatus(row, cmd)"
          >
            <el-button link type="primary">
              变更状态<el-icon class="el-icon--right"><ArrowDown /></el-icon>
            </el-button>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item v-for="s in STATUS_FLOW[row.status]" :key="s" :command="s">
                  {{ ORDER_STATUS[s].label }}
                </el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
          <span v-else class="no-action">无操作</span>
        </template>
      </el-table-column>
    </el-table>

    <!-- 新建订单弹窗 -->
    <el-dialog v-model="createVisible" title="新建订单" width="680px">
      <el-form label-width="80px">
        <el-form-item label="客户" required>
          <el-select v-model="form.customerId" placeholder="选择客户" style="width: 100%">
            <el-option v-for="c in customers" :key="c.id" :label="c.name" :value="c.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="明细" required>
          <div style="width: 100%">
            <div v-for="(item, idx) in form.items" :key="idx" class="order-item-row">
              <el-select v-model="item.productId" placeholder="选择商品" style="width: 240px">
                <el-option
                  v-for="p in products"
                  :key="p.id"
                  :label="`${p.name}（¥${p.price} / 库存${p.stock}）`"
                  :value="p.id"
                />
              </el-select>
              <el-input-number v-model="item.quantity" :min="1" style="width: 140px" />
              <el-button
                link
                type="danger"
                :disabled="form.items.length === 1"
                @click="removeItem(idx)"
              >
                删除
              </el-button>
            </div>
            <el-button size="small" @click="addItem">+ 添加明细</el-button>
          </div>
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="form.remark" type="textarea" :rows="2" />
        </el-form-item>
        <el-form-item label="合计">
          <span style="font-weight: 600; font-size: 16px">¥ {{ totalAmount.toFixed(2) }}</span>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="createVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="onCreate">提交订单</el-button>
      </template>
    </el-dialog>
  </el-card>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { ArrowDown } from '@element-plus/icons-vue';
import { api } from '../api';
import { ORDER_STATUS, STATUS_FLOW } from '../constants';
import type { Customer, Order, Product } from '../types';

const list = ref<Order[]>([]);
const products = ref<Product[]>([]);
const customers = ref<Customer[]>([]);
const loading = ref(false);
const createVisible = ref(false);
const saving = ref(false);

const form = reactive<{
  customerId: number | undefined;
  items: { productId: number | undefined; quantity: number }[];
  remark: string;
}>({
  customerId: undefined,
  items: [{ productId: undefined, quantity: 1 }],
  remark: '',
});

// 前端预估合计（真正金额以后端计算为准）
const totalAmount = computed(() => {
  let total = 0;
  for (const item of form.items) {
    const p = products.value.find((x) => x.id === item.productId);
    if (p && item.quantity > 0) total += p.price * item.quantity;
  }
  return total;
});

async function load() {
  loading.value = true;
  try {
    const { data } = await api.getOrders();
    list.value = data;
  } catch {
    /* 拦截器已处理 */
  } finally {
    loading.value = false;
  }
}

async function loadOptions() {
  const [p, c] = await Promise.all([api.getProducts(), api.getCustomers()]);
  products.value = p.data;
  customers.value = c.data;
}

function openCreate() {
  form.customerId = undefined;
  form.items = [{ productId: undefined, quantity: 1 }];
  form.remark = '';
  createVisible.value = true;
}

function addItem() {
  form.items.push({ productId: undefined, quantity: 1 });
}

function removeItem(idx: number) {
  form.items.splice(idx, 1);
}

async function onCreate() {
  if (!form.customerId) {
    ElMessage.warning('请选择客户');
    return;
  }
  if (form.items.some((it) => !it.productId || it.quantity < 1)) {
    ElMessage.warning('请完整填写订单明细');
    return;
  }
  saving.value = true;
  try {
    await api.createOrder({
      customerId: form.customerId,
      items: form.items.map((it) => ({ productId: it.productId, quantity: it.quantity })),
      remark: form.remark,
    });
    ElMessage.success('下单成功，库存已扣减');
    createVisible.value = false;
    load();
    loadOptions(); // 刷新商品库存显示
  } catch (e: any) {
    ElMessage.error(e.response?.data?.message || '下单失败');
  } finally {
    saving.value = false;
  }
}

async function onChangeStatus(row: Order, status: string) {
  try {
    await api.updateOrderStatus(row.id, status);
    ElMessage.success(`订单已变更为「${ORDER_STATUS[status].label}」`);
    load();
  } catch (e: any) {
    ElMessage.error(e.response?.data?.message || '操作失败');
  }
}

onMounted(() => {
  load();
  loadOptions();
});
</script>

<style scoped>
.no-action {
  color: #c0c4cc;
  font-size: 13px;
}
</style>
