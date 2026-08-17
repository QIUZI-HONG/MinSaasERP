// 订单状态字典：状态码 -> 显示名 + 标签颜色
export const ORDER_STATUS: Record<
  string,
  { label: string; type: 'primary' | 'success' | 'warning' | 'info' | 'danger' }
> = {
  PENDING: { label: '待支付', type: 'warning' },
  PAID: { label: '已支付', type: 'primary' },
  SHIPPED: { label: '已发货', type: 'success' },
  DONE: { label: '已完成', type: 'success' },
  CANCELLED: { label: '已取消', type: 'info' },
};

// 允许的状态流转（与后端 STATUS_FLOW 保持一致，禁止跳级）
export const STATUS_FLOW: Record<string, string[]> = {
  PENDING: ['PAID', 'CANCELLED'],
  PAID: ['SHIPPED', 'CANCELLED'],
  SHIPPED: ['DONE'],
  DONE: [],
  CANCELLED: [],
};
