<template>
  <el-card shadow="never">
    <!-- 工具栏 -->
    <div class="toolbar">
      <el-input
        v-model="keyword"
        placeholder="搜索商品名 / SKU"
        style="width: 260px"
        clearable
        @keyup.enter="load"
        @clear="load"
      />
      <el-button type="primary" @click="openCreate">新增商品</el-button>
    </div>

    <!-- 列表 -->
    <el-table :data="list" v-loading="loading" border empty-text="暂无商品">
      <el-table-column prop="id" label="ID" width="70" />
      <el-table-column prop="sku" label="SKU" width="120" />
      <el-table-column prop="name" label="商品名称" min-width="180" />
      <el-table-column prop="category" label="分类" width="120" />
      <el-table-column label="价格" width="120">
        <template #default="{ row }">¥ {{ row.price.toFixed(2) }}</template>
      </el-table-column>
      <el-table-column prop="stock" label="库存" width="90" />
      <el-table-column label="操作" width="150" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" @click="openEdit(row)">编辑</el-button>
          <el-button link type="danger" @click="onDelete(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <!-- 新增/编辑弹窗 -->
    <el-dialog v-model="dialogVisible" :title="form.id ? '编辑商品' : '新增商品'" width="480px">
      <el-form :model="form" label-width="80px">
        <el-form-item label="SKU" required>
          <el-input v-model="form.sku" placeholder="如 SKU-007" />
        </el-form-item>
        <el-form-item label="名称" required>
          <el-input v-model="form.name" />
        </el-form-item>
        <el-form-item label="价格" required>
          <el-input-number v-model="form.price" :min="0" :precision="2" style="width: 100%" />
        </el-form-item>
        <el-form-item label="库存">
          <el-input-number v-model="form.stock" :min="0" style="width: 100%" />
        </el-form-item>
        <el-form-item label="分类">
          <el-input v-model="form.category" placeholder="如 外设 / 配件" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="onSave">保存</el-button>
      </template>
    </el-dialog>
  </el-card>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { api } from '../api';
import type { Product } from '../types';

const list = ref<Product[]>([]);
const loading = ref(false);
const keyword = ref('');
const dialogVisible = ref(false);
const saving = ref(false);

const form = reactive({
  id: 0,
  sku: '',
  name: '',
  price: 0,
  stock: 0,
  category: '',
});

async function load() {
  loading.value = true;
  try {
    const { data } = await api.getProducts(keyword.value || undefined);
    list.value = data;
  } catch {
    /* 拦截器已处理 */
  } finally {
    loading.value = false;
  }
}

function openCreate() {
  Object.assign(form, { id: 0, sku: '', name: '', price: 0, stock: 0, category: '' });
  dialogVisible.value = true;
}

function openEdit(row: Product) {
  Object.assign(form, {
    id: row.id,
    sku: row.sku,
    name: row.name,
    price: row.price,
    stock: row.stock,
    category: row.category || '',
  });
  dialogVisible.value = true;
}

async function onSave() {
  if (!form.sku || !form.name || form.price <= 0) {
    ElMessage.warning('请填写 SKU、名称且价格大于 0');
    return;
  }
  saving.value = true;
  try {
    const payload = {
      sku: form.sku,
      name: form.name,
      price: form.price,
      stock: form.stock,
      category: form.category,
    };
    if (form.id) {
      await api.updateProduct(form.id, payload);
      ElMessage.success('修改成功');
    } else {
      await api.createProduct(payload);
      ElMessage.success('新增成功');
    }
    dialogVisible.value = false;
    load();
  } catch (e: any) {
    ElMessage.error(e.response?.data?.message || '保存失败');
  } finally {
    saving.value = false;
  }
}

async function onDelete(row: Product) {
  try {
    await ElMessageBox.confirm(`确定删除商品「${row.name}」吗？`, '提示', { type: 'warning' });
  } catch {
    return;
  }
  try {
    await api.deleteProduct(row.id);
    ElMessage.success('删除成功');
    load();
  } catch (e: any) {
    ElMessage.error(e.response?.data?.message || '删除失败');
  }
}

onMounted(load);
</script>
