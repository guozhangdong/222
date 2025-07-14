const Router = require('koa-router');
const logger = require('../utils/logger');

const router = new Router({
  prefix: '/delivery'
});

// 获取配送状态
router.get('/status/:orderId', async (ctx) => {
  try {
    const user = ctx.state.user;
    const { orderId } = ctx.params;
    
    if (!user) {
      ctx.status = 401;
      ctx.body = {
        success: false,
        message: '用户未认证'
      };
      return;
    }

    // 这里应该查询配送任务表
    // const deliveryTask = await DeliveryTask.findOne({
    //   where: { orderId },
    //   include: [{ model: DeliveryMan }]
    // });

    // 模拟配送状态
    const deliveryStatus = {
      status: 'delivering',
      deliveryMan: {
        id: 1,
        name: '张师傅',
        phone: '138****8888',
        avatar: 'https://example.com/avatar.jpg'
      },
      currentLocation: {
        latitude: 39.9042,
        longitude: 116.4074
      },
      estimatedTime: new Date(Date.now() + 15 * 60 * 1000), // 15分钟后
      distance: 2.5, // 公里
      steps: [
        { status: 'completed', title: '商家已接单', time: new Date(Date.now() - 30 * 60 * 1000) },
        { status: 'completed', title: '正在制作', time: new Date(Date.now() - 20 * 60 * 1000) },
        { status: 'completed', title: '骑手已取餐', time: new Date(Date.now() - 10 * 60 * 1000) },
        { status: 'current', title: '正在配送', time: new Date() },
        { status: 'pending', title: '已送达', time: null }
      ]
    };

    ctx.body = {
      success: true,
      data: deliveryStatus
    };

  } catch (error) {
    logger.error('获取配送状态失败', {
      error: error.message,
      userId: ctx.state.user?.userId,
      orderId: ctx.params.orderId
    });

    ctx.status = 500;
    ctx.body = {
      success: false,
      message: '获取配送状态失败'
    };
  }
});

// 联系配送员
router.post('/contact/:orderId', async (ctx) => {
  try {
    const user = ctx.state.user;
    const { orderId } = ctx.params;
    
    if (!user) {
      ctx.status = 401;
      ctx.body = {
        success: false,
        message: '用户未认证'
      };
      return;
    }

    // 这里应该查询配送员信息并拨打电话
    // 目前只是模拟

    ctx.body = {
      success: true,
      message: '正在为您拨打电话'
    };

    logger.info('用户联系配送员', {
      userId: user.userId,
      orderId
    });

  } catch (error) {
    logger.error('联系配送员失败', {
      error: error.message,
      userId: ctx.state.user?.userId,
      orderId: ctx.params.orderId
    });

    ctx.status = 500;
    ctx.body = {
      success: false,
      message: '联系配送员失败'
    };
  }
});

module.exports = router;