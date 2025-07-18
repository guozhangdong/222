const Redis = require('ioredis');
const logger = require('../utils/logger');

const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: process.env.REDIS_PORT || 6379,
  password: process.env.REDIS_PASSWORD || undefined,
  db: process.env.REDIS_DB || 0,
  retryDelayOnFailover: 100,
  maxRetriesPerRequest: 3,
  lazyConnect: true,
  keepAlive: 30000,
  family: 4,
  keyPrefix: 'linlife:',
  retryStrategy: (times) => {
    const delay = Math.min(times * 50, 2000);
    return delay;
  }
});

// 连接事件监听
redis.on('connect', () => {
  logger.info('Redis连接成功');
});

redis.on('error', (error) => {
  logger.error('Redis连接错误:', error);
});

redis.on('close', () => {
  logger.warn('Redis连接关闭');
});

redis.on('reconnecting', () => {
  logger.info('Redis重新连接中...');
});

// Redis工具函数
const redisUtils = {
  // 设置缓存
  async set(key, value, ttl = 3600) {
    try {
      if (typeof value === 'object') {
        value = JSON.stringify(value);
      }
      await redis.setex(key, ttl, value);
      return true;
    } catch (error) {
      logger.error('Redis SET错误:', error);
      return false;
    }
  },

  // 获取缓存
  async get(key) {
    try {
      const value = await redis.get(key);
      if (!value) return null;
      
      try {
        return JSON.parse(value);
      } catch {
        return value;
      }
    } catch (error) {
      logger.error('Redis GET错误:', error);
      return null;
    }
  },

  // 删除缓存
  async del(key) {
    try {
      await redis.del(key);
      return true;
    } catch (error) {
      logger.error('Redis DEL错误:', error);
      return false;
    }
  },

  // 批量删除
  async delPattern(pattern) {
    try {
      const keys = await redis.keys(pattern);
      if (keys.length > 0) {
        await redis.del(...keys);
      }
      return keys.length;
    } catch (error) {
      logger.error('Redis DEL PATTERN错误:', error);
      return 0;
    }
  },

  // 设置哈希表
  async hset(key, field, value) {
    try {
      if (typeof value === 'object') {
        value = JSON.stringify(value);
      }
      await redis.hset(key, field, value);
      return true;
    } catch (error) {
      logger.error('Redis HSET错误:', error);
      return false;
    }
  },

  // 获取哈希表
  async hget(key, field) {
    try {
      const value = await redis.hget(key, field);
      if (!value) return null;
      
      try {
        return JSON.parse(value);
      } catch {
        return value;
      }
    } catch (error) {
      logger.error('Redis HGET错误:', error);
      return null;
    }
  },

  // 获取整个哈希表
  async hgetall(key) {
    try {
      const data = await redis.hgetall(key);
      const result = {};
      
      for (const [field, value] of Object.entries(data)) {
        try {
          result[field] = JSON.parse(value);
        } catch {
          result[field] = value;
        }
      }
      
      return result;
    } catch (error) {
      logger.error('Redis HGETALL错误:', error);
      return {};
    }
  },

  // 列表操作
  async lpush(key, value) {
    try {
      if (typeof value === 'object') {
        value = JSON.stringify(value);
      }
      return await redis.lpush(key, value);
    } catch (error) {
      logger.error('Redis LPUSH错误:', error);
      return 0;
    }
  },

  async rpop(key) {
    try {
      const value = await redis.rpop(key);
      if (!value) return null;
      
      try {
        return JSON.parse(value);
      } catch {
        return value;
      }
    } catch (error) {
      logger.error('Redis RPOP错误:', error);
      return null;
    }
  },

  // 有序集合操作
  async zadd(key, score, member) {
    try {
      if (typeof member === 'object') {
        member = JSON.stringify(member);
      }
      return await redis.zadd(key, score, member);
    } catch (error) {
      logger.error('Redis ZADD错误:', error);
      return 0;
    }
  },

  async zrange(key, start, stop, withScores = false) {
    try {
      const options = withScores ? 'WITHSCORES' : undefined;
      const result = await redis.zrange(key, start, stop, options);
      
      if (withScores) {
        const formatted = [];
        for (let i = 0; i < result.length; i += 2) {
          const member = result[i];
          const score = parseFloat(result[i + 1]);
          
          try {
            formatted.push({
              member: JSON.parse(member),
              score
            });
          } catch {
            formatted.push({
              member,
              score
            });
          }
        }
        return formatted;
      }
      
      return result.map(item => {
        try {
          return JSON.parse(item);
        } catch {
          return item;
        }
      });
    } catch (error) {
      logger.error('Redis ZRANGE错误:', error);
      return [];
    }
  },

  // 检查键是否存在
  async exists(key) {
    try {
      return await redis.exists(key);
    } catch (error) {
      logger.error('Redis EXISTS错误:', error);
      return false;
    }
  },

  // 设置过期时间
  async expire(key, seconds) {
    try {
      return await redis.expire(key, seconds);
    } catch (error) {
      logger.error('Redis EXPIRE错误:', error);
      return false;
    }
  },

  // 获取TTL
  async ttl(key) {
    try {
      return await redis.ttl(key);
    } catch (error) {
      logger.error('Redis TTL错误:', error);
      return -1;
    }
  }
};

module.exports = {
  redis,
  redisUtils
};