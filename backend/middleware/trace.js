const { v4: uuidv4 } = require('uuid');
const logger = require('../utils/logger');

// 链路追踪中间件
const trace = () => {
  return async (ctx, next) => {
    const startTime = Date.now();
    
    // 生成或获取追踪ID
    const traceId = ctx.headers['x-trace-id'] || uuidv4();
    const requestId = uuidv4();
    
    // 设置追踪上下文
    ctx.state.traceId = traceId;
    ctx.state.requestId = requestId;
    ctx.state.startTime = startTime;
    
    // 设置响应头
    ctx.set('X-Trace-ID', traceId);
    ctx.set('X-Request-ID', requestId);
    
    // 记录请求开始日志
    logger.debug('Request started', {
      traceId,
      requestId,
      method: ctx.method,
      url: ctx.url,
      ip: ctx.ip,
      userAgent: ctx.headers['user-agent'],
      userId: ctx.state.user?.userId
    });
    
    try {
      await next();
      
      // 记录请求完成日志
      const duration = Date.now() - startTime;
      logger.debug('Request completed', {
        traceId,
        requestId,
        method: ctx.method,
        url: ctx.url,
        status: ctx.status,
        duration: `${duration}ms`,
        userId: ctx.state.user?.userId
      });
      
    } catch (error) {
      // 记录请求错误日志
      const duration = Date.now() - startTime;
      logger.error('Request failed', {
        traceId,
        requestId,
        method: ctx.method,
        url: ctx.url,
        status: ctx.status,
        duration: `${duration}ms`,
        error: error.message,
        userId: ctx.state.user?.userId
      });
      
      throw error;
    }
  };
};

// 数据库操作追踪
const dbTrace = (operation, model) => {
  return async (ctx, next) => {
    const startTime = Date.now();
    const traceId = ctx.state.traceId;
    
    try {
      await next();
      
      const duration = Date.now() - startTime;
      logger.debug('Database operation completed', {
        traceId,
        operation,
        model: model.name,
        duration: `${duration}ms`
      });
      
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error('Database operation failed', {
        traceId,
        operation,
        model: model.name,
        duration: `${duration}ms`,
        error: error.message
      });
      
      throw error;
    }
  };
};

// 外部API调用追踪
const apiTrace = (apiName, url) => {
  return async (ctx, next) => {
    const startTime = Date.now();
    const traceId = ctx.state.traceId;
    
    try {
      await next();
      
      const duration = Date.now() - startTime;
      logger.debug('External API call completed', {
        traceId,
        apiName,
        url,
        duration: `${duration}ms`
      });
      
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error('External API call failed', {
        traceId,
        apiName,
        url,
        duration: `${duration}ms`,
        error: error.message
      });
      
      throw error;
    }
  };
};

// 业务操作追踪
const businessTrace = (operation, details = {}) => {
  return async (ctx, next) => {
    const startTime = Date.now();
    const traceId = ctx.state.traceId;
    
    try {
      await next();
      
      const duration = Date.now() - startTime;
      logger.info('Business operation completed', {
        traceId,
        operation,
        details,
        duration: `${duration}ms`,
        userId: ctx.state.user?.userId
      });
      
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error('Business operation failed', {
        traceId,
        operation,
        details,
        duration: `${duration}ms`,
        error: error.message,
        userId: ctx.state.user?.userId
      });
      
      throw error;
    }
  };
};

// 性能追踪
const performanceTrace = (operation) => {
  return async (ctx, next) => {
    const startTime = Date.now();
    const traceId = ctx.state.traceId;
    
    try {
      await next();
      
      const duration = Date.now() - startTime;
      
      // 记录性能指标
      logger.logUtils.logPerformance(operation, duration, {
        traceId,
        userId: ctx.state.user?.userId,
        url: ctx.url,
        method: ctx.method
      });
      
      // 如果执行时间过长，记录警告
      if (duration > 1000) {
        logger.warn('Slow operation detected', {
          traceId,
          operation,
          duration: `${duration}ms`,
          userId: ctx.state.user?.userId
        });
      }
      
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error('Operation failed', {
        traceId,
        operation,
        duration: `${duration}ms`,
        error: error.message,
        userId: ctx.state.user?.userId
      });
      
      throw error;
    }
  };
};

module.exports = {
  trace,
  dbTrace,
  apiTrace,
  businessTrace,
  performanceTrace
};