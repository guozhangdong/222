const logger = require('../utils/logger');

// 权限控制中间件
const permission = (requiredRole) => {
  return async (ctx, next) => {
    try {
      const user = ctx.state.user;
      
      if (!user) {
        ctx.status = 401;
        ctx.body = {
          success: false,
          message: '用户未认证'
        };
        return;
      }

      // 检查用户角色
      if (!user.role) {
        ctx.status = 403;
        ctx.body = {
          success: false,
          message: '用户角色未定义'
        };
        return;
      }

      // 角色权限映射
      const roleHierarchy = {
        'user': 1,
        'merchant': 2,
        'admin': 3,
        'super_admin': 4
      };

      const userRoleLevel = roleHierarchy[user.role] || 0;
      const requiredRoleLevel = roleHierarchy[requiredRole] || 0;

      if (userRoleLevel < requiredRoleLevel) {
        logger.warn('Permission denied', {
          userId: user.userId,
          userRole: user.role,
          requiredRole,
          ip: ctx.ip,
          url: ctx.url
        });

        ctx.status = 403;
        ctx.body = {
          success: false,
          message: '权限不足'
        };
        return;
      }

      // 记录权限检查日志
      logger.debug('Permission check passed', {
        userId: user.userId,
        userRole: user.role,
        requiredRole,
        url: ctx.url
      });

      await next();
    } catch (error) {
      logger.error('Permission check failed', {
        error: error.message,
        userId: ctx.state.user?.userId,
        url: ctx.url
      });

      ctx.status = 500;
      ctx.body = {
        success: false,
        message: '权限检查失败'
      };
    }
  };
};

// 资源所有者权限检查
const resourceOwner = (resourceModel, resourceIdField = 'id') => {
  return async (ctx, next) => {
    try {
      const user = ctx.state.user;
      const resourceId = ctx.params[resourceIdField];
      
      if (!user || !resourceId) {
        ctx.status = 400;
        ctx.body = {
          success: false,
          message: '参数错误'
        };
        return;
      }

      // 管理员可以访问所有资源
      if (user.role === 'admin' || user.role === 'super_admin') {
        await next();
        return;
      }

      // 查找资源
      const resource = await resourceModel.findByPk(resourceId);
      
      if (!resource) {
        ctx.status = 404;
        ctx.body = {
          success: false,
          message: '资源不存在'
        };
        return;
      }

      // 检查资源所有者
      if (resource.userId !== user.userId) {
        logger.warn('Resource access denied', {
          userId: user.userId,
          resourceId,
          resourceOwner: resource.userId,
          url: ctx.url
        });

        ctx.status = 403;
        ctx.body = {
          success: false,
          message: '无权访问此资源'
        };
        return;
      }

      // 将资源信息存储到ctx.state中
      ctx.state.resource = resource;

      await next();
    } catch (error) {
      logger.error('Resource owner check failed', {
        error: error.message,
        userId: ctx.state.user?.userId,
        url: ctx.url
      });

      ctx.status = 500;
      ctx.body = {
        success: false,
        message: '资源权限检查失败'
      };
    }
  };
};

// 商家权限检查
const merchantPermission = () => {
  return async (ctx, next) => {
    try {
      const user = ctx.state.user;
      
      if (!user) {
        ctx.status = 401;
        ctx.body = {
          success: false,
          message: '用户未认证'
        };
        return;
      }

      // 检查是否为商家或管理员
      if (user.role !== 'merchant' && user.role !== 'admin' && user.role !== 'super_admin') {
        ctx.status = 403;
        ctx.body = {
          success: false,
          message: '需要商家权限'
        };
        return;
      }

      await next();
    } catch (error) {
      logger.error('Merchant permission check failed', {
        error: error.message,
        userId: ctx.state.user?.userId
      });

      ctx.status = 500;
      ctx.body = {
        success: false,
        message: '权限检查失败'
      };
    }
  };
};

// 操作频率限制
const operationRateLimit = (operation, maxCount = 10, windowMs = 60000) => {
  return async (ctx, next) => {
    try {
      const user = ctx.state.user;
      const key = `rate_limit:${operation}:${user.userId}`;
      
      // 获取当前操作次数
      const currentCount = await ctx.state.redis.get(key) || 0;
      
      if (parseInt(currentCount) >= maxCount) {
        ctx.status = 429;
        ctx.body = {
          success: false,
          message: '操作过于频繁，请稍后再试'
        };
        return;
      }

      // 增加操作次数
      await ctx.state.redis.incr(key);
      
      // 设置过期时间
      if (parseInt(currentCount) === 0) {
        await ctx.state.redis.expire(key, Math.floor(windowMs / 1000));
      }

      await next();
    } catch (error) {
      logger.error('Rate limit check failed', {
        error: error.message,
        operation,
        userId: ctx.state.user?.userId
      });

      // 限流检查失败时允许请求继续
      await next();
    }
  };
};

module.exports = {
  permission,
  resourceOwner,
  merchantPermission,
  operationRateLimit
};