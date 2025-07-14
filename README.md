# 邻·生活 - 本地生活服务平台

## 项目简介

邻·生活是一个基于微信小程序的本地生活服务平台，提供餐饮外卖、社区配送、积分商城等服务。

### 核心功能

- 🍽️ **餐饮外卖**：商家列表、菜品详情、购物车、微信支付
- 🚚 **社区配送**：末端配送任务、实时位置追踪、ETA预估
- 🎁 **积分系统**：消费返积分、签到奖励、积分商城
- 👑 **会员体系**：等级权益、升级奖励、专属优惠
- 📊 **运营后台**：数据可视化、订单管理、用户分析
- 🔧 **运营配置**：动态配置返积分比例、升级门槛、优惠券

### 技术栈

#### 后端
- **框架**: Koa2 + Sequelize + JWT
- **数据库**: MySQL + Redis
- **支付**: 微信支付 SDK
- **部署**: Docker + 微信云托管
- **监控**: Winston 日志 + 链路追踪

#### 前端
- **框架**: 微信小程序原生开发
- **UI**: 自定义组件库
- **状态管理**: 本地存储 + 全局状态
- **可视化**: ECharts 图表

## 项目结构

```
linlife/
├── backend/          # 后端服务
├── miniprogram/      # 微信小程序前端
├── admin/           # 运营后台
├── docs/            # 项目文档
└── deploy/          # 部署配置
```

## 快速开始

### 环境要求

- Node.js >= 16
- MySQL >= 8.0
- Redis >= 6.0
- 微信开发者工具

### 安装依赖

```bash
# 后端
cd backend
npm install

# 前端
cd miniprogram
npm install
```

### 配置环境变量

```bash
# 复制环境变量模板
cp backend/.env.example backend/.env

# 编辑配置
vim backend/.env
```

### 启动服务

```bash
# 后端开发服务器
cd backend
npm run dev

# 前端开发
# 使用微信开发者工具打开 miniprogram 目录
```

## 部署说明

### 开发环境
```bash
docker-compose -f deploy/docker-compose.dev.yml up -d
```

### 生产环境
```bash
# 使用微信云托管
cd deploy
./deploy.sh
```

## 开发规范

- 代码规范：ESLint + Prettier
- 提交规范：Conventional Commits
- 测试覆盖：Jest + Supertest
- API文档：Swagger/OpenAPI

## 迭代计划

### 阶段1 (MVP) - 1-2个月
- [x] 餐饮外卖基础功能
- [x] 微信支付集成
- [x] 社区配送系统
- [x] 积分系统
- [x] 运营后台

### 阶段2 - 2个月
- [ ] 积分商城
- [ ] 会员体系升级
- [ ] 运营配置面板

### 阶段3 - 2个月
- [ ] 生鲜超市
- [ ] 商家端管理
- [ ] 配送可视化
- [ ] 自动报表

### 阶段4 - 2个月
- [ ] 拼团团购
- [ ] 优惠券叠加
- [ ] 分销裂变
- [ ] 运营大屏

## 贡献指南

1. Fork 项目
2. 创建功能分支
3. 提交代码
4. 创建 Pull Request

## 许可证

MIT License

## 联系方式

- 项目维护者：[您的姓名]
- 邮箱：[您的邮箱]
- 微信：[您的微信号]