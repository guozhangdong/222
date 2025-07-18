const Router = require('koa-router');
const Dish = require('../models/Dish');
const logger = require('../utils/logger');

const router = new Router({
  prefix: '/dishes'
});

// 获取菜品列表
router.get('/', async (ctx) => {
  try {
    const { 
      merchantId, 
      categoryId, 
      keyword,
      page = 1, 
      limit = 20 
    } = ctx.query;

    let dishes;
    const offset = (page - 1) * limit;

    if (keyword) {
      // 搜索菜品
      dishes = await Dish.search(keyword, merchantId ? parseInt(merchantId) : null, parseInt(limit));
    } else {
      // 获取菜品列表
      const options = {};
      if (merchantId) {
        options.merchantId = parseInt(merchantId);
      }
      if (categoryId) {
        options.categoryId = parseInt(categoryId);
      }
      
      dishes = await Dish.findByMerchant(parseInt(merchantId), options);
    }

    ctx.body = {
      success: true,
      data: {
        dishes: Array.isArray(dishes) ? dishes : dishes.rows,
        pagination: Array.isArray(dishes) ? null : {
          page: parseInt(page),
          limit: parseInt(limit),
          total: dishes.count,
          pages: Math.ceil(dishes.count / limit)
        }
      }
    };

  } catch (error) {
    logger.error('获取菜品列表失败', {
      error: error.message,
      query: ctx.query
    });

    ctx.status = 500;
    ctx.body = {
      success: false,
      message: '获取菜品列表失败'
    };
  }
});

// 获取菜品详情
router.get('/:id', async (ctx) => {
  try {
    const { id } = ctx.params;

    const dish = await Dish.findByPk(id);
    
    if (!dish) {
      ctx.status = 404;
      ctx.body = {
        success: false,
        message: '菜品不存在'
      };
      return;
    }

    ctx.body = {
      success: true,
      data: dish
    };

  } catch (error) {
    logger.error('获取菜品详情失败', {
      error: error.message,
      dishId: ctx.params.id
    });

    ctx.status = 500;
    ctx.body = {
      success: false,
      message: '获取菜品详情失败'
    };
  }
});

// 获取推荐菜品
router.get('/recommend/list', async (ctx) => {
  try {
    const { merchantId, limit = 10 } = ctx.query;

    const dishes = await Dish.findRecommend(merchantId ? parseInt(merchantId) : null, parseInt(limit));

    ctx.body = {
      success: true,
      data: dishes
    };

  } catch (error) {
    logger.error('获取推荐菜品失败', {
      error: error.message
    });

    ctx.status = 500;
    ctx.body = {
      success: false,
      message: '获取推荐菜品失败'
    };
  }
});

// 获取热门菜品
router.get('/hot/list', async (ctx) => {
  try {
    const { merchantId, limit = 10 } = ctx.query;

    const dishes = await Dish.findHot(merchantId ? parseInt(merchantId) : null, parseInt(limit));

    ctx.body = {
      success: true,
      data: dishes
    };

  } catch (error) {
    logger.error('获取热门菜品失败', {
      error: error.message
    });

    ctx.status = 500;
    ctx.body = {
      success: false,
      message: '获取热门菜品失败'
    };
  }
});

// 获取新品菜品
router.get('/new/list', async (ctx) => {
  try {
    const { merchantId, limit = 10 } = ctx.query;

    const dishes = await Dish.findNew(merchantId ? parseInt(merchantId) : null, parseInt(limit));

    ctx.body = {
      success: true,
      data: dishes
    };

  } catch (error) {
    logger.error('获取新品菜品失败', {
      error: error.message
    });

    ctx.status = 500;
    ctx.body = {
      success: false,
      message: '获取新品菜品失败'
    };
  }
});

module.exports = router;