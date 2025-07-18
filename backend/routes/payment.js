const Router = require('koa-router');
const Joi = require('joi');
const paymentService = require('../services/paymentService');
const Order = require('../models/Order');
const User = require('../models/User');
const logger = require('../utils/logger');

const router = new Router({
  prefix: '/payment'
});

// 创建支付订单
router.post('/create', async (ctx) => {
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
      orderId: Joi.number().required(),
      openid: Joi.string().required()
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

    const { orderId, openid } = value;

    // 查找订单
    const order = await Order.findByPk(orderId);
    
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

    // 检查订单状态
    if (order.payStatus !== 'unpaid') {
      ctx.status = 400;
      ctx.body = {
        success: false,
        message: '订单状态不正确'
      };
      return;
    }

    // 调用微信统一下单
    const unifiedOrderResult = await paymentService.createUnifiedOrder({
      orderNo: order.orderNo,
      totalFee: order.payAmount,
      openid: openid,
      body: '邻·生活订单',
      attach: JSON.stringify({ orderId: order.id })
    });

    // 生成小程序支付参数
    const payParams = paymentService.generateMiniProgramPayParams(unifiedOrderResult.prepay_id);

    ctx.body = {
      success: true,
      message: '支付参数生成成功',
      data: {
        orderNo: order.orderNo,
        payAmount: order.payAmount,
        payParams
      }
    };

    logger.info('支付参数生成成功', {
      userId: user.userId,
      orderId: order.id,
      orderNo: order.orderNo
    });

  } catch (error) {
    logger.error('创建支付订单失败', {
      error: error.message,
      userId: ctx.state.user?.userId,
      body: ctx.request.body
    });

    ctx.status = 500;
    ctx.body = {
      success: false,
      message: '创建支付订单失败'
    };
  }
});

// 查询支付状态
router.get('/status/:orderNo', async (ctx) => {
  try {
    const user = ctx.state.user;
    const { orderNo } = ctx.params;
    
    if (!user) {
      ctx.status = 401;
      ctx.body = {
        success: false,
        message: '用户未认证'
      };
      return;
    }

    // 查找订单
    const order = await Order.findByOrderNo(orderNo);
    
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

    // 如果订单已支付，直接返回
    if (order.payStatus === 'paid') {
      ctx.body = {
        success: true,
        data: {
          orderNo: order.orderNo,
          payStatus: order.payStatus,
          payTime: order.payTime,
          payMethod: order.payMethod
        }
      };
      return;
    }

    // 查询微信支付状态
    const wxResult = await paymentService.queryOrder(orderNo);

    if (wxResult.return_code === 'SUCCESS' && wxResult.result_code === 'SUCCESS') {
      const tradeState = wxResult.trade_state;
      
      if (tradeState === 'SUCCESS') {
        // 支付成功，更新订单状态
        await order.paySuccess('wechat');
        
        // 更新用户消费金额和积分
        const userInfo = await User.findByPk(user.userId);
        await userInfo.updateSpent(order.payAmount);
        
        // 计算并添加积分
        const pointsRate = parseFloat(process.env.POINTS_RATE) || 0.05;
        const pointsEarned = Math.floor(order.payAmount * pointsRate);
        if (pointsEarned > 0) {
          await userInfo.addPoints(pointsEarned, '消费奖励');
          order.pointsEarned = pointsEarned;
          await order.save();
        }

        ctx.body = {
          success: true,
          data: {
            orderNo: order.orderNo,
            payStatus: 'paid',
            payTime: order.payTime,
            payMethod: 'wechat',
            pointsEarned
          }
        };
      } else {
        ctx.body = {
          success: true,
          data: {
            orderNo: order.orderNo,
            payStatus: 'unpaid',
            tradeState
          }
        };
      }
    } else {
      ctx.body = {
        success: true,
        data: {
          orderNo: order.orderNo,
          payStatus: 'unpaid',
          tradeState: 'UNKNOWN'
        }
      };
    }

  } catch (error) {
    logger.error('查询支付状态失败', {
      error: error.message,
      userId: ctx.state.user?.userId,
      orderNo: ctx.params.orderNo
    });

    ctx.status = 500;
    ctx.body = {
      success: false,
      message: '查询支付状态失败'
    };
  }
});

// 微信支付回调
router.post('/notify', async (ctx) => {
  try {
    const xmlData = ctx.request.rawBody || ctx.request.body;
    
    // 处理支付回调
    const result = await paymentService.handlePaymentNotify(xmlData);
    
    if (result.success) {
      // 查找订单
      const order = await Order.findByOrderNo(result.orderNo);
      
      if (order && order.payStatus === 'unpaid') {
        // 更新订单状态
        await order.paySuccess('wechat');
        
        // 更新用户消费金额和积分
        const userInfo = await User.findByPk(order.userId);
        await userInfo.updateSpent(order.payAmount);
        
        // 计算并添加积分
        const pointsRate = parseFloat(process.env.POINTS_RATE) || 0.05;
        const pointsEarned = Math.floor(order.payAmount * pointsRate);
        if (pointsEarned > 0) {
          await userInfo.addPoints(pointsEarned, '消费奖励');
          order.pointsEarned = pointsEarned;
          await order.save();
        }

        logger.info('支付成功处理完成', {
          orderNo: order.orderNo,
          userId: order.userId,
          payAmount: order.payAmount,
          pointsEarned
        });
      }
    }

    // 返回成功响应给微信
    ctx.type = 'xml';
    ctx.body = '<xml><return_code><![CDATA[SUCCESS]]></return_code><return_msg><![CDATA[OK]]></return_msg></xml>';

  } catch (error) {
    logger.error('处理支付回调失败', {
      error: error.message,
      body: ctx.request.body
    });

    // 返回失败响应给微信
    ctx.type = 'xml';
    ctx.body = '<xml><return_code><![CDATA[FAIL]]></return_code><return_msg><![CDATA[处理失败]]></return_msg></xml>';
  }
});

// 申请退款
router.post('/refund', async (ctx) => {
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
      orderId: Joi.number().required(),
      refundAmount: Joi.number().positive().required(),
      reason: Joi.string().max(200).required()
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

    const { orderId, refundAmount, reason } = value;

    // 查找订单
    const order = await Order.findByPk(orderId);
    
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

    // 检查订单状态
    if (order.status !== 'completed') {
      ctx.status = 400;
      ctx.body = {
        success: false,
        message: '订单状态不正确'
      };
      return;
    }

    // 检查退款金额
    if (refundAmount > order.payAmount) {
      ctx.status = 400;
      ctx.body = {
        success: false,
        message: '退款金额不能超过支付金额'
      };
      return;
    }

    // 生成退款单号
    const refundNo = paymentService.generateRefundNo();

    // 调用微信退款接口
    const refundResult = await paymentService.refund({
      orderNo: order.orderNo,
      refundNo,
      totalFee: order.payAmount,
      refundFee: refundAmount,
      reason
    });

    if (refundResult.return_code === 'SUCCESS' && refundResult.result_code === 'SUCCESS') {
      // 更新订单状态
      order.status = 'refunded';
      order.refundReason = reason;
      order.refundTime = new Date();
      order.refundAmount = refundAmount;
      await order.save();

      ctx.body = {
        success: true,
        message: '退款申请成功',
        data: {
          refundNo,
          refundAmount,
          refundTime: order.refundTime
        }
      };

      logger.info('退款申请成功', {
        userId: user.userId,
        orderId: order.id,
        refundNo,
        refundAmount
      });
    } else {
      throw new Error(refundResult.err_code_des || '退款失败');
    }

  } catch (error) {
    logger.error('申请退款失败', {
      error: error.message,
      userId: ctx.state.user?.userId,
      body: ctx.request.body
    });

    ctx.status = 500;
    ctx.body = {
      success: false,
      message: '申请退款失败'
    };
  }
});

// 微信退款回调
router.post('/refund-notify', async (ctx) => {
  try {
    const xmlData = ctx.request.rawBody || ctx.request.body;
    
    // 处理退款回调
    const result = await paymentService.handleRefundNotify(xmlData);
    
    if (result.success) {
      // 查找订单
      const order = await Order.findByOrderNo(result.orderNo);
      
      if (order) {
        // 更新订单退款状态
        order.refundAmount = result.refundFee;
        order.refundTime = new Date();
        await order.save();

        logger.info('退款成功处理完成', {
          orderNo: order.orderNo,
          refundNo: result.refundNo,
          refundFee: result.refundFee
        });
      }
    }

    // 返回成功响应给微信
    ctx.type = 'xml';
    ctx.body = '<xml><return_code><![CDATA[SUCCESS]]></return_code><return_msg><![CDATA[OK]]></return_msg></xml>';

  } catch (error) {
    logger.error('处理退款回调失败', {
      error: error.message,
      body: ctx.request.body
    });

    // 返回失败响应给微信
    ctx.type = 'xml';
    ctx.body = '<xml><return_code><![CDATA[FAIL]]></return_code><return_msg><![CDATA[处理失败]]></return_msg></xml>';
  }
});

// 获取支付配置
router.get('/config', async (ctx) => {
  try {
    ctx.body = {
      success: true,
      data: {
        appId: process.env.WX_APPID,
        pointsRate: parseFloat(process.env.POINTS_RATE) || 0.05,
        signInPoints: parseInt(process.env.SIGN_IN_POINTS) || 5
      }
    };
  } catch (error) {
    logger.error('获取支付配置失败', {
      error: error.message
    });

    ctx.status = 500;
    ctx.body = {
      success: false,
      message: '获取支付配置失败'
    };
  }
});

module.exports = router;