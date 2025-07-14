const Koa = require('koa');
const Router = require('koa-router');
const bodyParser = require('koa-bodyparser');
const cors = require('koa-cors');
const static = require('koa-static');
const helmet = require('koa-helmet');
const compress = require('koa-compress');
const rateLimit = require('koa-ratelimit');
const xmlBody = require('koa-xml-body');
const path = require('path');
const fs = require('fs');

// 配置加载
require('dotenv').config();

// 工具模块
const logger = require('./utils/logger');
const errorHandler = require('./middleware/errorHandler');
const auth = require('./middleware/auth');
const permission = require('./middleware/permission');
const trace = require('./middleware/trace');

// 数据库连接
const { sequelize } = require('./config/database');
const redis = require('./config/redis');

// 路由
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const merchantRoutes = require('./routes/merchants');
const dishRoutes = require('./routes/dishes');
const orderRoutes = require('./routes/orders');
const paymentRoutes = require('./routes/payment');
const deliveryRoutes = require('./routes/delivery');
const pointRoutes = require('./routes/points');
const adminRoutes = require('./routes/admin');
const reportRoutes = require('./routes/reports');

const app = new Koa();
const router = new Router();

// 安全中间件
app.use(helmet());

// 压缩中间件
app.use(compress({
  filter(content_type) {
    return /text|javascript|json/i.test(content_type);
  },
  threshold: 2048,
  gzip: {
    flush: require('zlib').constants.Z_SYNC_FLUSH
  },
  deflate: {
    flush: require('zlib').constants.Z_SYNC_FLUSH
  },
  br: false
}));

// CORS配置
app.use(cors({
  origin: (ctx) => {
    const allowedOrigins = [
      'http://localhost:3000',
      'http://localhost:8080',
      'https://your-domain.com'
    ];
    const origin = ctx.request.header.origin;
    return allowedOrigins.includes(origin) ? origin : false;
  },
  credentials: true,
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization', 'Accept']
}));

// 限流中间件
const limiter = rateLimit({
  driver: 'redis',
  db: redis,
  duration: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 900000,
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
  errorMessage: '请求过于频繁，请稍后再试',
  id: (ctx) => ctx.ip,
  headers: {
    remaining: 'Rate-Limit-Remaining',
    reset: 'Rate-Limit-Reset',
    total: 'Rate-Limit-Total'
  }
});

app.use(limiter);

// 链路追踪
app.use(trace());

// 错误处理中间件
app.use(errorHandler);

// XML解析中间件（用于微信支付回调）
app.use(xmlBody({
  encoding: 'utf8',
  xmlOptions: {
    explicitArray: false
  }
}));

// 请求体解析
app.use(bodyParser({
  enableTypes: ['json', 'form', 'text'],
  jsonLimit: '10mb',
  formLimit: '10mb',
  textLimit: '10mb'
}));

// 静态文件服务
app.use(static(path.join(__dirname, 'public')));

// 上传文件服务
app.use(static(path.join(__dirname, process.env.UPLOAD_PATH || 'uploads')));

// 路由中间件
app.use(async (ctx, next) => {
  ctx.state.redis = redis;
  ctx.state.logger = logger;
  await next();
});

// API路由
router.use('/api/v1/auth', authRoutes.routes(), authRoutes.allowedMethods());
router.use('/api/v1/users', auth(), userRoutes.routes(), userRoutes.allowedMethods());
router.use('/api/v1/merchants', merchantRoutes.routes(), merchantRoutes.allowedMethods());
router.use('/api/v1/dishes', dishRoutes.routes(), dishRoutes.allowedMethods());
router.use('/api/v1/orders', auth(), orderRoutes.routes(), orderRoutes.allowedMethods());
router.use('/api/v1/payment', auth(), paymentRoutes.routes(), paymentRoutes.allowedMethods());
router.use('/api/v1/delivery', auth(), deliveryRoutes.routes(), deliveryRoutes.allowedMethods());
router.use('/api/v1/points', auth(), pointRoutes.routes(), pointRoutes.allowedMethods());
router.use('/api/v1/admin', auth(), permission('admin'), adminRoutes.routes(), adminRoutes.allowedMethods());
router.use('/api/v1/reports', auth(), permission('admin'), reportRoutes.routes(), reportRoutes.allowedMethods());

// 健康检查
router.get('/health', async (ctx) => {
  try {
    await sequelize.authenticate();
    await redis.ping();
    ctx.body = {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV
    };
  } catch (error) {
    ctx.status = 503;
    ctx.body = {
      status: 'error',
      message: error.message
    };
  }
});

// API文档
router.get('/api-docs', async (ctx) => {
  ctx.body = {
    message: '邻·生活 API 文档',
    version: '1.0.0',
    endpoints: {
      auth: '/api/v1/auth',
      users: '/api/v1/users',
      merchants: '/api/v1/merchants',
      dishes: '/api/v1/dishes',
      orders: '/api/v1/orders',
      payment: '/api/v1/payment',
      delivery: '/api/v1/delivery',
      points: '/api/v1/points',
      admin: '/api/v1/admin',
      reports: '/api/v1/reports'
    }
  };
});

app.use(router.routes());
app.use(router.allowedMethods());

// 404处理
app.use(async (ctx) => {
  ctx.status = 404;
  ctx.body = {
    error: 'Not Found',
    message: '请求的资源不存在',
    path: ctx.path
  };
});

// 全局错误处理
app.on('error', (err, ctx) => {
  logger.error('应用错误:', err);
  logger.error('请求信息:', {
    method: ctx.method,
    url: ctx.url,
    ip: ctx.ip,
    userAgent: ctx.headers['user-agent']
  });
});

// 优雅关闭
process.on('SIGTERM', async () => {
  logger.info('收到 SIGTERM 信号，开始优雅关闭...');
  await sequelize.close();
  await redis.quit();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('收到 SIGINT 信号，开始优雅关闭...');
  await sequelize.close();
  await redis.quit();
  process.exit(0);
});

// 启动服务器
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';

app.listen(PORT, HOST, () => {
  logger.info(`邻·生活后端服务启动成功`);
  logger.info(`环境: ${process.env.NODE_ENV}`);
  logger.info(`地址: http://${HOST}:${PORT}`);
  logger.info(`健康检查: http://${HOST}:${PORT}/health`);
  logger.info(`API文档: http://${HOST}:${PORT}/api-docs`);
});

module.exports = app;