// 业务校验错误：抛出后由全局错误处理中间件统一转为 HTTP 400
export class BizError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BizError';
  }
}
