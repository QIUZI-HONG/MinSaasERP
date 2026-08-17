// 统一错误体系：
//  - HttpError：带 HTTP 状态码的业务/参数错误（400/404/429 等），由全局错误处理中间件按状态码返回
//  - BizError：兼容旧用法，等价于 HttpError 400
export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
  }
}

export class BizError extends HttpError {
  constructor(message: string) {
    super(400, message);
    this.name = 'BizError';
  }
}

// 参数校验错误（HTTP 400）
export function badRequest(message: string): HttpError {
  return new HttpError(400, message);
}
