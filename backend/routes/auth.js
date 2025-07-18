const Router = require('koa-router');
const Joi = require('joi');
const axios = require('axios');
const JWTUtils = require('../utils/jwt');
const User = require('../models/User');
const logger = require('../utils/logger');
const { redis } = require('../config/redis');

const router = new Router({
  prefix: '/auth'
});

// 微信登录
router.post('/wechat-login', async (ctx) => {
  try {
    const schema = Joi.object({
      code: Joi.string().required(),
      userInfo: Joi.object({
        nickName: Joi.string(),
        avatarUrl: Joi.string(),
        gender: Joi.number(),
        country: Joi.string(),
        province: Joi.string(),
        city: Joi.string()
      }).optional()
    });

    const { error, value } = schema.validate(ctx.request.body);
    if (error) {
      ctx.status = 400;
      ctx.body = {
        success: false,
        message: '参数错误',
        details: error.details
      };
      return;
    }

    const { code, userInfo } = value;

    // 获取微信openid
    const wxResponse = await axios.get('https://api.weixin.qq.com/sns/jscode2session', {
      params: {
        appid: process.env.WX_APPID,
        secret: process.env.WX_SECRET,
        js_code: code,
        grant_type: 'authorization_code'
      },
      timeout: 10000
    });

    const { openid, session_key, unionid } = wxResponse.data;

    if (!openid) {
      ctx.status = 400;
      ctx.body = {
        success: false,
        message: '微信登录失败'
      };
      return;
    }

    // 查找或创建用户
    let user = await User.findByOpenid(openid);

    if (!user) {
      // 新用户注册
      user = await User.create({
        openid,
        unionid,
        nickname: userInfo?.nickName || '微信用户',
        avatar: userInfo?.avatarUrl,
        gender: userInfo?.gender === 1 ? 'male' : userInfo?.gender === 2 ? 'female' : 'unknown',
        province: userInfo?.province,
        city: userInfo?.city
      });

      logger.info('新用户注册', {
        userId: user.id,
        openid
      });
    } else {
      // 更新用户信息
      if (userInfo) {
        await user.update({
          nickname: userInfo.nickName || user.nickname,
          avatar: userInfo.avatarUrl || user.avatar,
          gender: userInfo.gender === 1 ? 'male' : userInfo.gender === 2 ? 'female' : user.gender,
          province: userInfo.province || user.province,
          city: userInfo.city || user.city
        });
      }

      // 更新登录信息
      user.lastLoginAt = new Date();
      user.loginCount += 1;
      await user.save();
    }

    // 生成JWT令牌
    const tokenPayload = {
      userId: user.id,
      openid: user.openid,
      role: user.role
    };

    const tokens = JWTUtils.generateTokenPair(tokenPayload);

    // 缓存session_key
    await redis.setex(`session:${openid}`, 7200, session_key);

    ctx.body = {
      success: true,
      message: '登录成功',
      data: {
        user: {
          id: user.id,
          nickname: user.nickname,
          avatar: user.avatar,
          role: user.role,
          level: user.level,
          points: user.points
        },
        ...tokens
      }
    };

    logger.info('用户登录成功', {
      userId: user.id,
      openid
    });

  } catch (error) {
    logger.error('微信登录失败', {
      error: error.message,
      body: ctx.request.body
    });

    ctx.status = 500;
    ctx.body = {
      success: false,
      message: '登录失败'
    };
  }
});

// 刷新令牌
router.post('/refresh-token', async (ctx) => {
  try {
    const schema = Joi.object({
      refreshToken: Joi.string().required()
    });

    const { error, value } = schema.validate(ctx.request.body);
    if (error) {
      ctx.status = 400;
      ctx.body = {
        success: false,
        message: '参数错误'
      };
      return;
    }

    const { refreshToken } = value;

    // 验证刷新令牌
    const decoded = JWTUtils.verifyToken(refreshToken);

    // 检查令牌是否在黑名单中
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
    logger.error('刷新令牌失败', {
      error: error.message
    });

    ctx.status = 401;
    ctx.body = {
      success: false,
      message: '令牌刷新失败'
    };
  }
});

// 注销
router.post('/logout', async (ctx) => {
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

    logger.info('用户注销', {
      userId: ctx.state.user?.userId
    });

  } catch (error) {
    logger.error('注销失败', {
      error: error.message
    });

    ctx.status = 500;
    ctx.body = {
      success: false,
      message: '注销失败'
    };
  }
});

// 获取用户信息
router.get('/profile', async (ctx) => {
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

    const userInfo = await User.findByPk(user.userId);
    
    if (!userInfo) {
      ctx.status = 404;
      ctx.body = {
        success: false,
        message: '用户不存在'
      };
      return;
    }

    ctx.body = {
      success: true,
      data: {
        id: userInfo.id,
        nickname: userInfo.nickname,
        avatar: userInfo.avatar,
        phone: userInfo.phone,
        email: userInfo.email,
        gender: userInfo.gender,
        role: userInfo.role,
        level: userInfo.level,
        points: userInfo.points,
        totalPoints: userInfo.totalPoints,
        totalSpent: userInfo.totalSpent,
        signInCount: userInfo.signInCount,
        lastSignInAt: userInfo.lastSignInAt,
        inviteCode: userInfo.inviteCode,
        inviteCount: userInfo.inviteCount,
        address: {
          province: userInfo.province,
          city: userInfo.city,
          district: userInfo.district,
          address: userInfo.address
        },
        preferences: userInfo.preferences,
        settings: userInfo.settings
      }
    };

  } catch (error) {
    logger.error('获取用户信息失败', {
      error: error.message,
      userId: ctx.state.user?.userId
    });

    ctx.status = 500;
    ctx.body = {
      success: false,
      message: '获取用户信息失败'
    };
  }
});

// 更新用户信息
router.put('/profile', async (ctx) => {
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

    const schema = Joi.object({
      nickname: Joi.string().max(50),
      avatar: Joi.string().uri(),
      phone: Joi.string().pattern(/^1[3-9]\d{9}$/),
      email: Joi.string().email(),
      gender: Joi.string().valid('male', 'female', 'unknown'),
      birthday: Joi.date(),
      province: Joi.string(),
      city: Joi.string(),
      district: Joi.string(),
      address: Joi.string(),
      preferences: Joi.object(),
      settings: Joi.object()
    });

    const { error, value } = schema.validate(ctx.request.body);
    if (error) {
      ctx.status = 400;
      ctx.body = {
        success: false,
        message: '参数错误',
        details: error.details
      };
      return;
    }

    const userInfo = await User.findByPk(user.userId);
    
    if (!userInfo) {
      ctx.status = 404;
      ctx.body = {
        success: false,
        message: '用户不存在'
      };
      return;
    }

    // 检查手机号是否已被使用
    if (value.phone && value.phone !== userInfo.phone) {
      const existingUser = await User.findByPhone(value.phone);
      if (existingUser && existingUser.id !== user.userId) {
        ctx.status = 409;
        ctx.body = {
          success: false,
          message: '手机号已被使用'
        };
        return;
      }
    }

    // 检查邮箱是否已被使用
    if (value.email && value.email !== userInfo.email) {
      const existingUser = await User.findOne({ where: { email: value.email } });
      if (existingUser && existingUser.id !== user.userId) {
        ctx.status = 409;
        ctx.body = {
          success: false,
          message: '邮箱已被使用'
        };
        return;
      }
    }

    // 更新用户信息
    await userInfo.update(value);

    ctx.body = {
      success: true,
      message: '更新成功',
      data: {
        id: userInfo.id,
        nickname: userInfo.nickname,
        avatar: userInfo.avatar,
        phone: userInfo.phone,
        email: userInfo.email,
        gender: userInfo.gender,
        role: userInfo.role,
        level: userInfo.level,
        points: userInfo.points,
        totalPoints: userInfo.totalPoints,
        totalSpent: userInfo.totalSpent,
        signInCount: userInfo.signInCount,
        lastSignInAt: userInfo.lastSignInAt,
        inviteCode: userInfo.inviteCode,
        inviteCount: userInfo.inviteCount,
        address: {
          province: userInfo.province,
          city: userInfo.city,
          district: userInfo.district,
          address: userInfo.address
        },
        preferences: userInfo.preferences,
        settings: userInfo.settings
      }
    };

    logger.info('用户信息更新', {
      userId: user.userId,
      updatedFields: Object.keys(value)
    });

  } catch (error) {
    logger.error('更新用户信息失败', {
      error: error.message,
      userId: ctx.state.user?.userId
    });

    ctx.status = 500;
    ctx.body = {
      success: false,
      message: '更新失败'
    };
  }
});

// 绑定手机号
router.post('/bind-phone', async (ctx) => {
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

    const schema = Joi.object({
      phone: Joi.string().pattern(/^1[3-9]\d{9}$/).required(),
      code: Joi.string().length(6).required()
    });

    const { error, value } = schema.validate(ctx.request.body);
    if (error) {
      ctx.status = 400;
      ctx.body = {
        success: false,
        message: '参数错误'
      };
      return;
    }

    const { phone, code } = value;

    // 验证短信验证码
    const cacheKey = `sms:${phone}`;
    const cachedCode = await redis.get(cacheKey);
    
    if (!cachedCode || cachedCode !== code) {
      ctx.status = 400;
      ctx.body = {
        success: false,
        message: '验证码错误或已过期'
      };
      return;
    }

    // 检查手机号是否已被使用
    const existingUser = await User.findByPhone(phone);
    if (existingUser && existingUser.id !== user.userId) {
      ctx.status = 409;
      ctx.body = {
        success: false,
        message: '手机号已被使用'
      };
      return;
    }

    // 更新用户手机号
    const userInfo = await User.findByPk(user.userId);
    await userInfo.update({ phone });

    // 删除验证码缓存
    await redis.del(cacheKey);

    ctx.body = {
      success: true,
      message: '手机号绑定成功'
    };

    logger.info('手机号绑定成功', {
      userId: user.userId,
      phone
    });

  } catch (error) {
    logger.error('绑定手机号失败', {
      error: error.message,
      userId: ctx.state.user?.userId
    });

    ctx.status = 500;
    ctx.body = {
      success: false,
      message: '绑定失败'
    };
  }
});

// 发送短信验证码
router.post('/send-sms', async (ctx) => {
  try {
    const schema = Joi.object({
      phone: Joi.string().pattern(/^1[3-9]\d{9}$/).required(),
      type: Joi.string().valid('bind', 'login', 'reset').required()
    });

    const { error, value } = schema.validate(ctx.request.body);
    if (error) {
      ctx.status = 400;
      ctx.body = {
        success: false,
        message: '参数错误'
      };
      return;
    }

    const { phone, type } = value;

    // 检查发送频率
    const rateLimitKey = `sms_rate_limit:${phone}`;
    const rateLimit = await redis.get(rateLimitKey);
    
    if (rateLimit) {
      ctx.status = 429;
      ctx.body = {
        success: false,
        message: '发送过于频繁，请稍后再试'
      };
      return;
    }

    // 生成验证码
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    
    // 缓存验证码（5分钟有效）
    const cacheKey = `sms:${phone}`;
    await redis.setex(cacheKey, 300, code);
    
    // 设置发送频率限制（1分钟）
    await redis.setex(rateLimitKey, 60, '1');

    // 这里应该调用短信服务发送验证码
    // 目前只是模拟发送
    logger.info('发送短信验证码', {
      phone,
      code,
      type
    });

    ctx.body = {
      success: true,
      message: '验证码发送成功'
    };

  } catch (error) {
    logger.error('发送短信验证码失败', {
      error: error.message,
      body: ctx.request.body
    });

    ctx.status = 500;
    ctx.body = {
      success: false,
      message: '发送失败'
    };
  }
});

module.exports = router;