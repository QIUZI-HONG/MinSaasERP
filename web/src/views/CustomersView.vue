<template>
  <el-card shadow="never">
    <div class="toolbar">
      <span></span>
      <el-button type="primary" @click="openCreate">新增客户</el-button>
    </div>

    <el-table :data="list" v-loading="loading" border empty-text="暂无客户">
      <el-table-column prop="id" label="ID" width="70" />
      <el-table-column prop="name" label="客户名称" min-width="200" />
      <el-table-column prop="contact" label="联系人" width="120" />
      <el-table-column prop="phone" label="电话" width="150" />
      <el-table-column prop="address" label="地址" min-width="180" />
      <el-table-column label="操作" width="150" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" @click="openEdit(row)">编辑</el-button>
          <el-button link type="danger" @click="onDelete(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-dialog v-model="dialogVisible" :title="form.id ? '编辑客户' : '新增客户'" width="480px">
      <el-form :model="form" label-width="80px">
        <el-form-item label="名称" required>
          <el-input v-model="form.name" />
        </el-form-item>
        <el-form-item label="联系人">
          <el-input v-model="form.contact" />
        </el-form-item>
        <el-form-item label="电话">
          <el-input v-model="form.phone" />
        </el-form-item>
        <el-form-item label="地址">
          <el-input v-model="form.address" />
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
import type { Customer } from '../types';

const list = ref<Customer[]>([]);
const loading = ref(false);
const dialogVisible = ref(false);
const saving = ref(false);

const form = reactive({ id: 0, name: '', contact: '', phone: '', address: '' });

async function load() {
  loading.value = true;
  try {
    const { data } = await api.getCustomers();
    list.value = data;
  } catch {
    /* 拦截器已处理 */
  } finally {
    loading.value = false;
  }
}

function openCreate() {
  Object.assign(form, { id: 0, name: '', contact: '', phone: '', address: '' });
  dialogVisible.value = true;
}

function openEdit(row: Customer) {
  Object.assign(form, {
    id: row.id,
    name: row.name,
    contact: row.contact || '',
    phone: row.phone || '',
    address: row.address || '',
  });
  dialogVisible.value = true;
}

async function onSave() {
  if (!form.name) {
    ElMessage.warning('请填写客户名称');
    return;
  }
  saving.value = true;
  try {
    const payload = { name: form.name, contact: form.contact, phone: form.phone, address: form.address };
    if (form.id) {
      await api.updateCustomer(form.id, payload);
      ElMessage.success('修改成功');
    } else {
      await api.createCustomer(payload);
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

async function onDelete(row: Customer) {
  try {
    await ElMessageBox.confirm(`确定删除客户「${row.name}」吗？`, '提示', { type: 'warning' });
  } catch {
    return;
  }
  try {
    await api.deleteCustomer(row.id);
    ElMessage.success('删除成功');
    load();
  } catch (e: any) {
    ElMessage.error(e.response?.data?.message || '删除失败');
  }
}

onMounted(load);
</script>
