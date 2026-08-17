// 轻量入参校验工具（零依赖）：
// 所有校验失败抛出 HttpError(400)，统一由全局错误处理返回，绝不产生 NaN/类型穿透
import { badRequest } from './errors';

/** 严格数字校验：必须是有穷数字，可选 min/max 边界 */
export function toNumber(v: unknown, field: string, opts: { min?: number; max?: number } = {}): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    throw badRequest(`参数 ${field} 必须是数字`);
  }
  if (opts.min !== undefined && v < opts.min) throw badRequest(`参数 ${field} 不能小于 ${opts.min}`);
  if (opts.max !== undefined && v > opts.max) throw badRequest(`参数 ${field} 不能大于 ${opts.max}`);
  return v;
}

/** 严格整数校验 */
export function toInt(v: unknown, field: string, opts: { min?: number; max?: number } = {}): number {
  const n = toNumber(v, field, opts);
  if (!Number.isInteger(n)) throw badRequest(`参数 ${field} 必须是整数`);
  return n;
}

/** 字符串校验：必须为字符串，可选长度边界；空字符串可由 required 控制 */
export function toStr(v: unknown, field: string, opts: { required?: boolean; min?: number; max?: number } = {}): string {
  if (typeof v !== 'string') throw badRequest(`参数 ${field} 必须是字符串`);
  const s = v.trim();
  if (opts.required && !s) throw badRequest(`参数 ${field} 不能为空`);
  if (opts.min !== undefined && s.length < opts.min) throw badRequest(`参数 ${field} 长度不能小于 ${opts.min}`);
  if (opts.max !== undefined && s.length > opts.max) throw badRequest(`参数 ${field} 长度不能超过 ${opts.max}`);
  return s;
}

/** 可选字符串：undefined/null/空 返回 null，否则走长度校验 */
export function toOptStr(v: unknown, field: string, opts: { min?: number; max?: number } = {}): string | null {
  if (v === undefined || v === null || v === '') return null;
  return toStr(v, field, opts);
}
