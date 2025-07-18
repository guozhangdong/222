const Router = require('koa-router');
const Joi = require('joi');
const User = require('../models/User');
const logger = require('../utils/logger');

const router = new Router({
  prefix: '/users'
});

// 签到
router.post('/sign-in', async (ctx) => {
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

    const result = await userInfo.signIn();

    ctx.body = {
      success: true,
      message: '签到成功',
      data: result
    };

    logger.info('用户签到成功', {
      userId: user.userId,
      points: result.points,
      signInCount: result.signInCount
    });

  } catch (error) {
    logger.error('签到失败', {
      error: error.message,
      userId: ctx.state.user?.userId
    });

    ctx.status = 400;
    ctx.body = {
      success: false,
      message: error.message || '签到失败'
    };
  }
});

// 获取积分记录
router.get('/points/records', async (ctx) => {
  try {
    const user = ctx.state.user;
    const { page = 1, limit = 20 } = ctx.query;
    
    if (!user) {
      ctx.status = 401;
      ctx.body = {
        success: false,
        message: '用户未认证'
      };
      return;
    }

    const offset = (page - 1) * limit;

    // 这里应该查询积分记录表
    // const records = await PointRecord.findAndCountAll({
    //   where: { userId: user.userId },
    //   order: [['created_at', 'DESC']],
    //   limit: parseInt(limit),
    //   offset: parseInt(offset)
    // });

    // 模拟数据
    const records = {
      count: 0,
      rows: []
    };

    ctx.body = {
      success: true,
      data: {
        records: records.rows,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: records.count,
          pages: Math.ceil(records.count / limit)
        }
      }
    };

  } catch (error) {
    logger.error('获取积分记录失败', {
      error: error.message,
      userId: ctx.state.user?.userId
    });

    ctx.status = 500;
    ctx.body = {
      success: false,
      message: '获取积分记录失败'
    };
  }
});

// 邀请好友
router.post('/invite', async (ctx) => {
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
      inviteCode: Joi.string().required()
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

    const { inviteCode } = value;

    // 查找邀请人
    const inviter = await User.findByInviteCode(inviteCode);
    
    if (!inviter) {
      ctx.status = 404;
      ctx.body = {
        success: false,
        message: '邀请码无效'
      };
      return;
    }

    // 不能邀请自己
    if (inviter.id === user.userId) {
      ctx.status = 400;
      ctx.body = {
        success: false,
        message: '不能邀请自己'
      };
      return;
    }

    // 更新当前用户的邀请人
    const currentUser = await User.findByPk(user.userId);
    if (currentUser.invitedBy) {
      ctx.status = 400;
      ctx.body = {
        success: false,
        message: '已经使用过邀请码'
      };
      return;
    }

    await currentUser.update({ invitedBy: inviter.id });

    // 增加邀请人的邀请数量
    inviter.inviteCount += 1;
    await inviter.save();

    // 给邀请人奖励积分
    const inviteReward = 50; // 邀请奖励积分
    await inviter.addPoints(inviteReward, '邀请好友奖励');

    // 给被邀请人奖励积分
    const newUserReward = 20; // 新用户奖励积分
    await currentUser.addPoints(newUserReward, '好友邀请奖励');

    ctx.body = {
      success: true,
      message: '邀请成功',
      data: {
        inviterName: inviter.nickname,
        inviteReward,
        newUserReward
      }
    };

    logger.info('邀请好友成功', {
      userId: user.userId,
      inviterId: inviter.id,
      inviteReward,
      newUserReward
    });

  } catch (error) {
    logger.error('邀请好友失败', {
      error: error.message,
      userId: ctx.state.user?.userId
    });

    ctx.status = 500;
    ctx.body = {
      success: false,
      message: '邀请失败'
    };
  }
});

// 获取邀请信息
router.get('/invite/info', async (ctx) => {
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
        inviteCode: userInfo.inviteCode,
        inviteCount: userInfo.inviteCount,
        invitedBy: userInfo.invitedBy
      }
    };

  } catch (error) {
    logger.error('获取邀请信息失败', {
      error: error.message,
      userId: ctx.state.user?.userId
    });

    ctx.status = 500;
    ctx.body = {
      success: false,
      message: '获取邀请信息失败'
    };
  }
});

module.exports = router;