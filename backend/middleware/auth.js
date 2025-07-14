const JWTUtils = require('../utils/jwt');
const { redis } = require('../config/redis');
const logger = require('../utils/logger');

// JWT认证中间件
const auth = () => {
  return async (ctx, next) => {
    try {
      // 从请求头获取令牌
      const authHeader = ctx.headers.authorization;
      const token = JWTUtils.extractTokenFromHeader(authHeader);
      
      if (!token) {
        ctx.status = 401;
        ctx.body = {
          success: false,
          message: '未提供认证令牌'
        };
        return;
      }

      // 检查令牌是否在黑名单中
      const isBlacklisted = await redis.get(`blacklist:${token}`);
      if (isBlacklisted) {
        ctx.status = 401;
        ctx.body = {
          success: false,
          message: '令牌已失效'
        };
        return;
      }

      // 验证令牌
      const decoded = JWTUtils.verifyToken(token);
      
      // 将用户信息存储到ctx.state中
      ctx.state.user = decoded;
      ctx.state.token = token;
      
      // 记录认证日志
      logger.debug('User authenticated', {
        userId: decoded.userId,
        ip: ctx.ip,
        userAgent: ctx.headers['user-agent']
      });

      await next();
    } catch (error) {
      logger.warn('Authentication failed', {
        error: error.message,
        ip: ctx.ip,
        userAgent: ctx.headers['user-agent']
      });

      ctx.status = 401;
      ctx.body = {
        success: false,
        message: error.message || '认证失败'
      };
    }
  };
};

// 可选认证中间件（不强制要求认证）
const optionalAuth = () => {
  return async (ctx, next) => {
    try {
      const authHeader = ctx.headers.authorization;
      const token = JWTUtils.extractTokenFromHeader(authHeader);
      
      if (token) {
        // 检查令牌是否在黑名单中
        const isBlacklisted = await redis.get(`blacklist:${token}`);
        if (!isBlacklisted) {
          try {
            const decoded = JWTUtils.verifyToken(token);
            ctx.state.user = decoded;
            ctx.state.token = token;
          } catch (error) {
            // 令牌无效，但不阻止请求继续
            logger.debug('Optional auth failed', { error: error.message });
          }
        }
      }
      
      await next();
    } catch (error) {
      // 可选认证失败不影响请求
      await next();
    }
  };
};

// 刷新令牌中间件
const refreshToken = () => {
  return async (ctx, next) => {
    try {
      const { refreshToken } = ctx.request.body;
      
      if (!refreshToken) {
        ctx.status = 400;
        ctx.body = {
          success: false,
          message: '刷新令牌不能为空'
        };
        return;
      }

      // 验证刷新令牌
      const decoded = JWTUtils.verifyToken(refreshToken);
      
      // 检查刷新令牌是否在黑名单中
      const isBlacklisted = await redis.get(`blacklist:${refreshToken}`);
      if (isBlacklisted) {
        ctx.status = 401;
        ctx.body = {
          success: false,
          message: '刷新令牌已失效'
        };
        return;
      }

      // 生成新的令牌对
      const newTokens = JWTUtils.generateTokenPair({
        userId: decoded.userId,
        openid: decoded.openid,
        role: decoded.role
      });

      // 将旧刷新令牌加入黑名单
      await redis.setex(`blacklist:${refreshToken}`, 7 * 24 * 60 * 60, '1');

      ctx.body = {
        success: true,
        message: '令牌刷新成功',
        data: newTokens
      };
    } catch (error) {
      logger.warn('Token refresh failed', { error: error.message });
      
      ctx.status = 401;
      ctx.body = {
        success: false,
        message: error.message || '令牌刷新失败'
      };
    }
  };
};

// 注销中间件
const logout = () => {
  return async (ctx, next) => {
    try {
      const token = ctx.state.token;
      
      if (token) {
        // 将令牌加入黑名单
        const decoded = JWTUtils.decodeToken(token);
        if (decoded && decoded.exp) {
          const ttl = decoded.exp - Math.floor(Date.now() / 1000);
          if (ttl > 0) {
            await redis.setex(`blacklist:${token}`, ttl, '1');
          }
        }
      }

      ctx.body = {
        success: true,
        message: '注销成功'
      };
    } catch (error) {
      logger.error('Logout failed', { error: error.message });
      
      ctx.status = 500;
      ctx.body = {
        success: false,
        message: '注销失败'
      };
    }
  };
};

module.exports = {
  auth,
  optionalAuth,
  refreshToken,
  logout
};