const logger = require('../utils/logger');

// 全局错误处理中间件
const errorHandler = async (ctx, next) => {
  const startTime = Date.now();
  
  try {
    await next();
    
    // 记录响应时间
    const responseTime = Date.now() - startTime;
    ctx.set('X-Response-Time', `${responseTime}ms`);
    
    // 记录HTTP请求日志
    logger.logUtils.logHttpRequest(
      ctx.method,
      ctx.url,
      ctx.status,
      responseTime,
      ctx.ip,
      ctx.headers['user-agent']
    );
    
  } catch (error) {
    const responseTime = Date.now() - startTime;
    
    // 记录错误日志
    logger.logUtils.logError(error, {
      method: ctx.method,
      url: ctx.url,
      ip: ctx.ip,
      userAgent: ctx.headers['user-agent'],
      responseTime: `${responseTime}ms`,
      userId: ctx.state.user?.userId
    });

    // 设置响应头
    ctx.set('X-Response-Time', `${responseTime}ms`);
    
    // 根据错误类型设置状态码和响应
    let status = 500;
    let message = '服务器内部错误';
    let details = null;

    // 处理不同类型的错误
    if (error.name === 'ValidationError') {
      status = 400;
      message = '数据验证失败';
      details = error.details;
    } else if (error.name === 'SequelizeValidationError') {
      status = 400;
      message = '数据验证失败';
      details = error.errors.map(err => ({
        field: err.path,
        message: err.message
      }));
    } else if (error.name === 'SequelizeUniqueConstraintError') {
      status = 409;
      message = '数据已存在';
      details = error.errors.map(err => ({
        field: err.path,
        message: err.message
      }));
    } else if (error.name === 'SequelizeForeignKeyConstraintError') {
      status = 400;
      message = '关联数据不存在';
    } else if (error.name === 'SequelizeDatabaseError') {
      status = 500;
      message = '数据库操作失败';
    } else if (error.name === 'JsonWebTokenError') {
      status = 401;
      message = '无效的认证令牌';
    } else if (error.name === 'TokenExpiredError') {
      status = 401;
      message = '认证令牌已过期';
    } else if (error.name === 'RateLimitExceeded') {
      status = 429;
      message = '请求过于频繁，请稍后再试';
    } else if (error.code === 'ENOTFOUND') {
      status = 503;
      message = '服务暂时不可用';
    } else if (error.code === 'ECONNREFUSED') {
      status = 503;
      message = '服务连接失败';
    } else if (error.status) {
      status = error.status;
      message = error.message || '请求失败';
    } else if (error.message) {
      message = error.message;
    }

    // 开发环境返回详细错误信息
    if (process.env.NODE_ENV === 'development') {
      ctx.body = {
        success: false,
        message,
        error: {
          name: error.name,
          message: error.message,
          stack: error.stack,
          details
        },
        timestamp: new Date().toISOString(),
        path: ctx.path,
        method: ctx.method
      };
    } else {
      // 生产环境只返回基本错误信息
      ctx.body = {
        success: false,
        message,
        ...(details && { details }),
        timestamp: new Date().toISOString()
      };
    }

    ctx.status = status;
  }
};

// 404错误处理
const notFoundHandler = async (ctx) => {
  ctx.status = 404;
  ctx.body = {
    success: false,
    message: '请求的资源不存在',
    path: ctx.path,
    method: ctx.method,
    timestamp: new Date().toISOString()
  };
};

// 请求体大小限制错误处理
const bodyParserErrorHandler = (error, ctx) => {
  logger.warn('Request body too large', {
    error: error.message,
    ip: ctx.ip,
    url: ctx.url
  });

  ctx.status = 413;
  ctx.body = {
    success: false,
    message: '请求体过大',
    timestamp: new Date().toISOString()
  };
};

// 异步错误处理
const asyncErrorHandler = (fn) => {
  return async (ctx, next) => {
    try {
      await fn(ctx, next);
    } catch (error) {
      // 让错误继续传播到全局错误处理器
      throw error;
    }
  };
};

module.exports = {
  errorHandler,
  notFoundHandler,
  bodyParserErrorHandler,
  asyncErrorHandler
};