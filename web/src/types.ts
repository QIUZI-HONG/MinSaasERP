// 前后端共用的数据形状（与 Prisma 模型对应）
export interface UserInfo {
  id: number;
  username: string;
  role: string;
}

export interface Product {
  id: number;
  sku: string;
  name: string;
  price: number;
  stock: number;
  category: string | null;
  createdAt: string;
}

export interface Customer {
  id: number;
  name: string;
  contact: string | null;
  phone: string | null;
  address: string | null;
  createdAt: string;
}

export interface OrderItem {
  id: number;
  productId: number;
  quantity: number;
  unitPrice: number;
  product: Product;
}

export interface Order {
  id: number;
  orderNo: string;
  customerId: number;
  customer: Customer;
  status: string;
  totalAmount: number;
  remark: string | null;
  createdAt: string;
  items: OrderItem[];
}

export interface DashboardStats {
  productCount: number;
  customerCount: number;
  orderCount: number;
  revenue: number;
  recentOrders: Order[];
}
