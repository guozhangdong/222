const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Order = sequelize.define('Order', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  orderNo: {
    type: DataTypes.STRING(50),
    unique: true,
    allowNull: false,
    comment: '订单号'
  },
  userId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: '用户ID'
  },
  merchantId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: '商家ID'
  },
  items: {
    type: DataTypes.JSON,
    allowNull: false,
    comment: '订单商品'
  },
  subtotal: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    comment: '商品小计'
  },
  deliveryFee: {
    type: DataTypes.DECIMAL(8, 2),
    defaultValue: 0.00,
    comment: '配送费'
  },
  discount: {
    type: DataTypes.DECIMAL(8, 2),
    defaultValue: 0.00,
    comment: '优惠金额'
  },
  total: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    comment: '订单总额'
  },
  payAmount: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    comment: '实付金额'
  },
  payMethod: {
    type: DataTypes.ENUM('wechat', 'alipay', 'balance', 'points'),
    allowNull: true,
    comment: '支付方式'
  },
  payStatus: {
    type: DataTypes.ENUM('unpaid', 'paid', 'refunded', 'partial_refunded'),
    defaultValue: 'unpaid',
    comment: '支付状态'
  },
  payTime: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: '支付时间'
  },
  status: {
    type: DataTypes.ENUM('pending', 'confirmed', 'preparing', 'ready', 'delivering', 'completed', 'cancelled', 'refunded'),
    defaultValue: 'pending',
    comment: '订单状态'
  },
  deliveryStatus: {
    type: DataTypes.ENUM('pending', 'assigned', 'picked', 'delivering', 'delivered'),
    defaultValue: 'pending',
    comment: '配送状态'
  },
  deliveryTaskId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: '配送任务ID'
  },
  deliveryAddress: {
    type: DataTypes.JSON,
    allowNull: false,
    comment: '配送地址'
  },
  deliveryTime: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: '预计送达时间'
  },
  actualDeliveryTime: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: '实际送达时间'
  },
  contactName: {
    type: DataTypes.STRING(50),
    allowNull: false,
    comment: '联系人姓名'
  },
  contactPhone: {
    type: DataTypes.STRING(20),
    allowNull: false,
    comment: '联系人电话'
  },
  remark: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: '订单备注'
  },
  cancelReason: {
    type: DataTypes.STRING(200),
    allowNull: true,
    comment: '取消原因'
  },
  cancelTime: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: '取消时间'
  },
  refundReason: {
    type: DataTypes.STRING(200),
    allowNull: true,
    comment: '退款原因'
  },
  refundTime: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: '退款时间'
  },
  refundAmount: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 0.00,
    comment: '退款金额'
  },
  commission: {
    type: DataTypes.DECIMAL(8, 2),
    defaultValue: 0.00,
    comment: '平台佣金'
  },
  pointsEarned: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    comment: '获得积分'
  },
  pointsUsed: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    comment: '使用积分'
  },
  couponId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: '优惠券ID'
  },
  couponAmount: {
    type: DataTypes.DECIMAL(8, 2),
    defaultValue: 0.00,
    comment: '优惠券金额'
  },
  rating: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: '订单评分'
  },
  ratingComment: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: '评价内容'
  },
  ratingTime: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: '评价时间'
  },
  merchantRemark: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: '商家备注'
  },
  adminRemark: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: '管理员备注'
  }
}, {
  tableName: 'orders',
  timestamps: true,
  indexes: [
    {
      fields: ['order_no']
    },
    {
      fields: ['user_id']
    },
    {
      fields: ['merchant_id']
    },
    {
      fields: ['status']
    },
    {
      fields: ['pay_status']
    },
    {
      fields: ['delivery_status']
    },
    {
      fields: ['created_at']
    },
    {
      fields: ['pay_time']
    },
    {
      fields: ['delivery_time']
    }
  ],
  hooks: {
    // 创建前生成订单号
    beforeCreate: async (order) => {
      if (!order.orderNo) {
        order.orderNo = generateOrderNo();
      }
    }
  }
});

// 生成订单号
function generateOrderNo() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  return `${year}${month}${day}${random}`;
}

// 实例方法
Order.prototype = {
  // 确认订单
  async confirm() {
    if (this.status !== 'pending') {
      throw new Error('订单状态不正确');
    }
    
    this.status = 'confirmed';
    await this.save();
  },

  // 开始准备
  async startPreparing() {
    if (this.status !== 'confirmed') {
      throw new Error('订单状态不正确');
    }
    
    this.status = 'preparing';
    await this.save();
  },

  // 准备完成
  async ready() {
    if (this.status !== 'preparing') {
      throw new Error('订单状态不正确');
    }
    
    this.status = 'ready';
    await this.save();
  },

  // 开始配送
  async startDelivery(deliveryTaskId) {
    if (this.status !== 'ready') {
      throw new Error('订单状态不正确');
    }
    
    this.status = 'delivering';
    this.deliveryStatus = 'delivering';
    this.deliveryTaskId = deliveryTaskId;
    await this.save();
  },

  // 完成配送
  async completeDelivery() {
    if (this.status !== 'delivering') {
      throw new Error('订单状态不正确');
    }
    
    this.status = 'completed';
    this.deliveryStatus = 'delivered';
    this.actualDeliveryTime = new Date();
    await this.save();
  },

  // 取消订单
  async cancel(reason) {
    if (!['pending', 'confirmed'].includes(this.status)) {
      throw new Error('订单状态不正确');
    }
    
    this.status = 'cancelled';
    this.cancelReason = reason;
    this.cancelTime = new Date();
    await this.save();
  },

  // 申请退款
  async requestRefund(reason) {
    if (this.status !== 'completed') {
      throw new Error('订单状态不正确');
    }
    
    this.status = 'refunded';
    this.refundReason = reason;
    this.refundTime = new Date();
    this.refundAmount = this.payAmount;
    await this.save();
  },

  // 支付成功
  async paySuccess(payMethod) {
    this.payStatus = 'paid';
    this.payMethod = payMethod;
    this.payTime = new Date();
    this.status = 'confirmed';
    await this.save();
  },

  // 添加评价
  async addRating(rating, comment) {
    if (this.status !== 'completed') {
      throw new Error('订单状态不正确');
    }
    
    this.rating = rating;
    this.ratingComment = comment;
    this.ratingTime = new Date();
    await this.save();
  },

  // 计算配送费
  calculateDeliveryFee() {
    // 这里可以根据距离、重量等计算配送费
    return this.deliveryFee;
  },

  // 计算优惠金额
  calculateDiscount() {
    let totalDiscount = 0;
    
    // 优惠券折扣
    if (this.couponAmount) {
      totalDiscount += parseFloat(this.couponAmount);
    }
    
    // 积分抵扣
    if (this.pointsUsed) {
      const pointsRate = 0.01; // 1积分=0.01元
      totalDiscount += this.pointsUsed * pointsRate;
    }
    
    return totalDiscount;
  },

  // 计算实付金额
  calculatePayAmount() {
    const total = parseFloat(this.total);
    const discount = this.calculateDiscount();
    return Math.max(0, total - discount);
  }
};

// 类方法
Order.findByUser = function(userId, options = {}) {
  const where = { userId };
  
  if (options.status) {
    where.status = options.status;
  }
  
  return this.findAll({
    where,
    order: [['created_at', 'DESC']],
    limit: options.limit || 20,
    offset: options.offset || 0
  });
};

Order.findByMerchant = function(merchantId, options = {}) {
  const where = { merchantId };
  
  if (options.status) {
    where.status = options.status;
  }
  
  return this.findAll({
    where,
    order: [['created_at', 'DESC']],
    limit: options.limit || 20,
    offset: options.offset || 0
  });
};

Order.findByOrderNo = function(orderNo) {
  return this.findOne({ where: { orderNo } });
};

Order.getStatistics = function(merchantId = null, startDate = null, endDate = null) {
  const where = {};
  
  if (merchantId) {
    where.merchantId = merchantId;
  }
  
  if (startDate && endDate) {
    where.createdAt = {
      [sequelize.Op.between]: [startDate, endDate]
    };
  }
  
  return this.findAll({
    where,
    attributes: [
      'status',
      [sequelize.fn('COUNT', sequelize.col('id')), 'count'],
      [sequelize.fn('SUM', sequelize.col('total')), 'totalAmount'],
      [sequelize.fn('SUM', sequelize.col('pay_amount')), 'payAmount']
    ],
    group: ['status']
  });
};

module.exports = Order;