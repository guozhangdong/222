const Router = require('koa-router');
const Joi = require('joi');
const Order = require('../models/Order');
const Dish = require('../models/Dish');
const Merchant = require('../models/Merchant');
const logger = require('../utils/logger');

const router = new Router({
  prefix: '/orders'
});

// 创建订单
router.post('/', async (ctx) => {
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
      merchantId: Joi.number().required(),
      items: Joi.array().items(
        Joi.object({
          dishId: Joi.number().required(),
          quantity: Joi.number().integer().min(1).required(),
          specId: Joi.string().optional(),
          addonIds: Joi.array().items(Joi.string()).optional(),
          remark: Joi.string().optional()
        })
      ).min(1).required(),
      deliveryAddress: Joi.object({
        name: Joi.string().required(),
        phone: Joi.string().required(),
        province: Joi.string().required(),
        city: Joi.string().required(),
        district: Joi.string().required(),
        address: Joi.string().required(),
        latitude: Joi.number().optional(),
        longitude: Joi.number().optional()
      }).required(),
      remark: Joi.string().optional(),
      couponId: Joi.number().optional(),
      pointsUsed: Joi.number().integer().min(0).optional()
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

    const { merchantId, items, deliveryAddress, remark, couponId, pointsUsed } = value;

    // 查找商家
    const merchant = await Merchant.findByPk(merchantId);
    if (!merchant || merchant.status !== 'active') {
      ctx.status = 400;
      ctx.body = {
        success: false,
        message: '商家不存在或未营业'
      };
      return;
    }

    // 检查配送范围
    if (deliveryAddress.latitude && deliveryAddress.longitude) {
      if (!merchant.isInDeliveryRange(deliveryAddress.latitude, deliveryAddress.longitude)) {
        ctx.status = 400;
        ctx.body = {
          success: false,
          message: '超出配送范围'
        };
        return;
      }
    }

    // 计算订单金额
    let subtotal = 0;
    const orderItems = [];

    for (const item of items) {
      const dish = await Dish.findByPk(item.dishId);
      if (!dish || dish.status !== 'active') {
        ctx.status = 400;
        ctx.body = {
          success: false,
          message: `菜品 ${dish?.name || item.dishId} 不存在或已下架`
        };
        return;
      }

      // 检查库存
      if (!dish.hasStock(item.quantity)) {
        ctx.status = 400;
        ctx.body = {
          success: false,
          message: `菜品 ${dish.name} 库存不足`
        };
        return;
      }

      // 计算菜品价格
      const itemPrice = dish.calculateTotalPrice(
        item.specId,
        item.addonIds || [],
        item.quantity
      );

      subtotal += itemPrice;

      orderItems.push({
        dishId: dish.id,
        dishName: dish.name,
        dishImage: dish.images[0],
        price: dish.price,
        quantity: item.quantity,
        specId: item.specId,
        addonIds: item.addonIds,
        totalPrice: itemPrice,
        remark: item.remark
      });
    }

    // 计算配送费
    const deliveryFee = merchant.getDeliveryFee(subtotal);

    // 计算优惠金额
    let discount = 0;
    let couponAmount = 0;

    if (couponId) {
      // 这里应该查询优惠券
      couponAmount = 5; // 模拟优惠券金额
      discount += couponAmount;
    }

    if (pointsUsed) {
      const pointsRate = 0.01; // 1积分=0.01元
      const pointsDiscount = pointsUsed * pointsRate;
      discount += pointsDiscount;
    }

    // 计算总额
    const total = subtotal + deliveryFee;
    const payAmount = Math.max(0, total - discount);

    // 创建订单
    const order = await Order.create({
      userId: user.userId,
      merchantId: merchant.id,
      items: orderItems,
      subtotal,
      deliveryFee,
      discount,
      total,
      payAmount,
      deliveryAddress,
      contactName: deliveryAddress.name,
      contactPhone: deliveryAddress.phone,
      remark,
      couponId,
      couponAmount,
      pointsUsed
    });

    // 减少库存
    for (const item of items) {
      const dish = await Dish.findByPk(item.dishId);
      await dish.decreaseStock(item.quantity);
    }

    ctx.body = {
      success: true,
      message: '订单创建成功',
      data: {
        orderId: order.id,
        orderNo: order.orderNo,
        payAmount: order.payAmount
      }
    };

    logger.info('订单创建成功', {
      userId: user.userId,
      orderId: order.id,
      orderNo: order.orderNo,
      payAmount: order.payAmount
    });

  } catch (error) {
    logger.error('创建订单失败', {
      error: error.message,
      userId: ctx.state.user?.userId,
      body: ctx.request.body
    });

    ctx.status = 500;
    ctx.body = {
      success: false,
      message: '创建订单失败'
    };
  }
});

// 获取订单列表
router.get('/', async (ctx) => {
  try {
    const user = ctx.state.user;
    const { status, page = 1, limit = 20 } = ctx.query;
    
    if (!user) {
      ctx.status = 401;
      ctx.body = {
        success: false,
        message: '用户未认证'
      };
      return;
    }

    const options = {};
    if (status) {
      options.status = status;
    }

    const orders = await Order.findByUser(user.userId, {
      ...options,
      limit: parseInt(limit),
      offset: (parseInt(page) - 1) * parseInt(limit)
    });

    ctx.body = {
      success: true,
      data: {
        orders,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: orders.length,
          pages: Math.ceil(orders.length / limit)
        }
      }
    };

  } catch (error) {
    logger.error('获取订单列表失败', {
      error: error.message,
      userId: ctx.state.user?.userId
    });

    ctx.status = 500;
    ctx.body = {
      success: false,
      message: '获取订单列表失败'
    };
  }
});

// 获取订单详情
router.get('/:id', async (ctx) => {
  try {
    const user = ctx.state.user;
    const { id } = ctx.params;
    
    if (!user) {
      ctx.status = 401;
      ctx.body = {
        success: false,
        message: '用户未认证'
      };
      return;
    }

    const order = await Order.findByPk(id);
    
    if (!order) {
      ctx.status = 404;
      ctx.body = {
        success: false,
        message: '订单不存在'
      };
      return;
    }

    // 验证订单所有者
    if (order.userId !== user.userId) {
      ctx.status = 403;
      ctx.body = {
        success: false,
        message: '无权查看此订单'
      };
      return;
    }

    ctx.body = {
      success: true,
      data: order
    };

  } catch (error) {
    logger.error('获取订单详情失败', {
      error: error.message,
      userId: ctx.state.user?.userId,
      orderId: ctx.params.id
    });

    ctx.status = 500;
    ctx.body = {
      success: false,
      message: '获取订单详情失败'
    };
  }
});

// 取消订单
router.post('/:id/cancel', async (ctx) => {
  try {
    const user = ctx.state.user;
    const { id } = ctx.params;
    const { reason } = ctx.request.body;
    
    if (!user) {
      ctx.status = 401;
      ctx.body = {
        success: false,
        message: '用户未认证'
      };
      return;
    }

    const order = await Order.findByPk(id);
    
    if (!order) {
      ctx.status = 404;
      ctx.body = {
        success: false,
        message: '订单不存在'
      };
      return;
    }

    // 验证订单所有者
    if (order.userId !== user.userId) {
      ctx.status = 403;
      ctx.body = {
        success: false,
        message: '无权操作此订单'
      };
      return;
    }

    await order.cancel(reason || '用户取消');

    // 恢复库存
    for (const item of order.items) {
      const dish = await Dish.findByPk(item.dishId);
      if (dish) {
        await dish.increaseStock(item.quantity);
      }
    }

    ctx.body = {
      success: true,
      message: '订单取消成功'
    };

    logger.info('订单取消成功', {
      userId: user.userId,
      orderId: order.id,
      reason
    });

  } catch (error) {
    logger.error('取消订单失败', {
      error: error.message,
      userId: ctx.state.user?.userId,
      orderId: ctx.params.id
    });

    ctx.status = 500;
    ctx.body = {
      success: false,
      message: error.message || '取消订单失败'
    };
  }
});

// 评价订单
router.post('/:id/rating', async (ctx) => {
  try {
    const user = ctx.state.user;
    const { id } = ctx.params;
    
    if (!user) {
      ctx.status = 401;
      ctx.body = {
        success: false,
        message: '用户未认证'
      };
      return;
    }

    const schema = Joi.object({
      rating: Joi.number().integer().min(1).max(5).required(),
      comment: Joi.string().max(500).optional()
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

    const { rating, comment } = value;

    const order = await Order.findByPk(id);
    
    if (!order) {
      ctx.status = 404;
      ctx.body = {
        success: false,
        message: '订单不存在'
      };
      return;
    }

    // 验证订单所有者
    if (order.userId !== user.userId) {
      ctx.status = 403;
      ctx.body = {
        success: false,
        message: '无权操作此订单'
      };
      return;
    }

    await order.addRating(rating, comment);

    // 更新商家评分
    const merchant = await Merchant.findByPk(order.merchantId);
    if (merchant) {
      await merchant.updateRating(rating);
    }

    ctx.body = {
      success: true,
      message: '评价成功'
    };

    logger.info('订单评价成功', {
      userId: user.userId,
      orderId: order.id,
      rating
    });

  } catch (error) {
    logger.error('评价订单失败', {
      error: error.message,
      userId: ctx.state.user?.userId,
      orderId: ctx.params.id
    });

    ctx.status = 500;
    ctx.body = {
      success: false,
      message: error.message || '评价失败'
    };
  }
});

module.exports = router;