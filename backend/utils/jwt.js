const jwt = require('jsonwebtoken');
const logger = require('./logger');

const JWT_SECRET = process.env.JWT_SECRET || 'your-jwt-secret-key';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

class JWTUtils {
  // 生成JWT令牌
  static generateToken(payload, expiresIn = JWT_EXPIRES_IN) {
    try {
      const token = jwt.sign(payload, JWT_SECRET, {
        expiresIn,
        issuer: 'linlife',
        audience: 'linlife-users'
      });
      
      logger.debug('JWT Token generated', {
        userId: payload.userId,
        expiresIn
      });
      
      return token;
    } catch (error) {
      logger.error('JWT Token generation failed:', error);
      throw new Error('令牌生成失败');
    }
  }

  // 验证JWT令牌
  static verifyToken(token) {
    try {
      const decoded = jwt.verify(token, JWT_SECRET, {
        issuer: 'linlife',
        audience: 'linlife-users'
      });
      
      logger.debug('JWT Token verified', {
        userId: decoded.userId
      });
      
      return decoded;
    } catch (error) {
      logger.warn('JWT Token verification failed:', error.message);
      
      if (error.name === 'TokenExpiredError') {
        throw new Error('令牌已过期');
      } else if (error.name === 'JsonWebTokenError') {
        throw new Error('无效的令牌');
      } else {
        throw new Error('令牌验证失败');
      }
    }
  }

  // 解码JWT令牌（不验证）
  static decodeToken(token) {
    try {
      return jwt.decode(token);
    } catch (error) {
      logger.error('JWT Token decode failed:', error);
      return null;
    }
  }

  // 刷新JWT令牌
  static refreshToken(token, expiresIn = JWT_EXPIRES_IN) {
    try {
      const decoded = jwt.verify(token, JWT_SECRET, {
        issuer: 'linlife',
        audience: 'linlife-users',
        ignoreExpiration: true
      });
      
      // 移除过期时间，生成新令牌
      delete decoded.exp;
      delete decoded.iat;
      
      return this.generateToken(decoded, expiresIn);
    } catch (error) {
      logger.error('JWT Token refresh failed:', error);
      throw new Error('令牌刷新失败');
    }
  }

  // 生成访问令牌和刷新令牌
  static generateTokenPair(payload) {
    try {
      const accessToken = this.generateToken(payload, '2h');
      const refreshToken = this.generateToken(payload, '7d');
      
      return {
        accessToken,
        refreshToken,
        expiresIn: 7200 // 2小时
      };
    } catch (error) {
      logger.error('JWT Token pair generation failed:', error);
      throw new Error('令牌对生成失败');
    }
  }

  // 从请求头提取令牌
  static extractTokenFromHeader(authHeader) {
    if (!authHeader) {
      return null;
    }
    
    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      return null;
    }
    
    return parts[1];
  }

  // 检查令牌是否即将过期
  static isTokenExpiringSoon(token, thresholdMinutes = 30) {
    try {
      const decoded = jwt.decode(token);
      if (!decoded || !decoded.exp) {
        return false;
      }
      
      const now = Math.floor(Date.now() / 1000);
      const threshold = thresholdMinutes * 60;
      
      return (decoded.exp - now) <= threshold;
    } catch (error) {
      logger.error('JWT Token expiration check failed:', error);
      return false;
    }
  }
}

module.exports = JWTUtils;