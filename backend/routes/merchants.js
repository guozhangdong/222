const Router = require('koa-router');
const Merchant = require('../models/Merchant');
const logger = require('../utils/logger');

const router = new Router({
  prefix: '/merchants'
});

// 获取商家列表
router.get('/', async (ctx) => {
  try {
    const { 
      category, 
      lat, 
      lng, 
      radius = 5000, 
      page = 1, 
      limit = 20,
      sort = 'rating'
    } = ctx.query;

    let merchants;
    const offset = (page - 1) * limit;

    if (lat && lng) {
      // 按距离查询
      merchants = await Merchant.findNearby(parseFloat(lat), parseFloat(lng), parseInt(radius));
    } else if (category) {
      // 按分类查询
      merchants = await Merchant.findByCategory(category);
    } else {
      // 获取所有商家
      const where = { status: 'active' };
      merchants = await Merchant.findAndCountAll({
        where,
        order: [[sort, 'DESC']],
        limit: parseInt(limit),
        offset: parseInt(offset)
      });
    }

    ctx.body = {
      success: true,
      data: {
        merchants: Array.isArray(merchants) ? merchants : merchants.rows,
        pagination: Array.isArray(merchants) ? null : {
          page: parseInt(page),
          limit: parseInt(limit),
          total: merchants.count,
          pages: Math.ceil(merchants.count / limit)
        }
      }
    };

  } catch (error) {
    logger.error('获取商家列表失败', {
      error: error.message,
      query: ctx.query
    });

    ctx.status = 500;
    ctx.body = {
      success: false,
      message: '获取商家列表失败'
    };
  }
});

// 获取商家详情
router.get('/:id', async (ctx) => {
  try {
    const { id } = ctx.params;

    const merchant = await Merchant.findByPk(id);
    
    if (!merchant) {
      ctx.status = 404;
      ctx.body = {
        success: false,
        message: '商家不存在'
      };
      return;
    }

    ctx.body = {
      success: true,
      data: merchant
    };

  } catch (error) {
    logger.error('获取商家详情失败', {
      error: error.message,
      merchantId: ctx.params.id
    });

    ctx.status = 500;
    ctx.body = {
      success: false,
      message: '获取商家详情失败'
    };
  }
});

// 获取推荐商家
router.get('/recommend/top-rated', async (ctx) => {
  try {
    const { limit = 10 } = ctx.query;

    const merchants = await Merchant.getTopRated(parseInt(limit));

    ctx.body = {
      success: true,
      data: merchants
    };

  } catch (error) {
    logger.error('获取推荐商家失败', {
      error: error.message
    });

    ctx.status = 500;
    ctx.body = {
      success: false,
      message: '获取推荐商家失败'
    };
  }
});

module.exports = router;