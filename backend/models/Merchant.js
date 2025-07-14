const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Merchant = sequelize.define('Merchant', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  userId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: '关联用户ID'
  },
  name: {
    type: DataTypes.STRING(100),
    allowNull: false,
    comment: '商家名称'
  },
  logo: {
    type: DataTypes.STRING(500),
    allowNull: true,
    comment: '商家logo'
  },
  banner: {
    type: DataTypes.STRING(500),
    allowNull: true,
    comment: '商家横幅'
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: '商家描述'
  },
  category: {
    type: DataTypes.STRING(50),
    allowNull: false,
    comment: '商家分类'
  },
  tags: {
    type: DataTypes.JSON,
    defaultValue: [],
    comment: '商家标签'
  },
  phone: {
    type: DataTypes.STRING(20),
    allowNull: false,
    comment: '联系电话'
  },
  address: {
    type: DataTypes.STRING(200),
    allowNull: false,
    comment: '商家地址'
  },
  province: {
    type: DataTypes.STRING(50),
    allowNull: true,
    comment: '省份'
  },
  city: {
    type: DataTypes.STRING(50),
    allowNull: true,
    comment: '城市'
  },
  district: {
    type: DataTypes.STRING(50),
    allowNull: true,
    comment: '区县'
  },
  latitude: {
    type: DataTypes.DECIMAL(10, 7),
    allowNull: true,
    comment: '纬度'
  },
  longitude: {
    type: DataTypes.DECIMAL(10, 7),
    allowNull: true,
    comment: '经度'
  },
  businessHours: {
    type: DataTypes.JSON,
    defaultValue: {},
    comment: '营业时间'
  },
  status: {
    type: DataTypes.ENUM('active', 'inactive', 'pending', 'suspended'),
    defaultValue: 'pending',
    comment: '商家状态'
  },
  rating: {
    type: DataTypes.DECIMAL(2, 1),
    defaultValue: 5.0,
    comment: '商家评分'
  },
  ratingCount: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    comment: '评分数量'
  },
  orderCount: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    comment: '订单数量'
  },
  totalSales: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 0.00,
    comment: '总销售额'
  },
  commissionRate: {
    type: DataTypes.DECIMAL(5, 2),
    defaultValue: 0.10,
    comment: '佣金比例'
  },
  minOrderAmount: {
    type: DataTypes.DECIMAL(8, 2),
    defaultValue: 0.00,
    comment: '最低起订金额'
  },
  deliveryFee: {
    type: DataTypes.DECIMAL(8, 2),
    defaultValue: 0.00,
    comment: '配送费'
  },
  freeDeliveryThreshold: {
    type: DataTypes.DECIMAL(8, 2),
    defaultValue: 0.00,
    comment: '免配送费门槛'
  },
  deliveryRadius: {
    type: DataTypes.INTEGER,
    defaultValue: 5000,
    comment: '配送半径(米)'
  },
  preparationTime: {
    type: DataTypes.INTEGER,
    defaultValue: 30,
    comment: '准备时间(分钟)'
  },
  certificates: {
    type: DataTypes.JSON,
    defaultValue: [],
    comment: '资质证书'
  },
  bankInfo: {
    type: DataTypes.JSON,
    defaultValue: {},
    comment: '银行信息'
  },
  settings: {
    type: DataTypes.JSON,
    defaultValue: {},
    comment: '商家设置'
  },
  remark: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: '备注'
  }
}, {
  tableName: 'merchants',
  timestamps: true,
  indexes: [
    {
      fields: ['user_id']
    },
    {
      fields: ['category']
    },
    {
      fields: ['status']
    },
    {
      fields: ['rating']
    },
    {
      fields: ['latitude', 'longitude']
    },
    {
      fields: ['created_at']
    }
  ]
});

// 实例方法
Merchant.prototype = {
  // 更新评分
  async updateRating(newRating) {
    const totalRating = this.rating * this.ratingCount + newRating;
    this.ratingCount += 1;
    this.rating = totalRating / this.ratingCount;
    await this.save();
  },

  // 增加订单数量
  async incrementOrderCount() {
    this.orderCount += 1;
    await this.save();
  },

  // 增加销售额
  async addSales(amount) {
    this.totalSales = parseFloat(this.totalSales) + parseFloat(amount);
    await this.save();
  },

  // 检查是否在配送范围内
  isInDeliveryRange(userLat, userLng) {
    if (!this.latitude || !this.longitude || !userLat || !userLng) {
      return false;
    }
    
    const distance = this.calculateDistance(
      this.latitude,
      this.longitude,
      userLat,
      userLng
    );
    
    return distance <= this.deliveryRadius;
  },

  // 计算距离
  calculateDistance(lat1, lng1, lat2, lng2) {
    const R = 6371000; // 地球半径(米)
    const dLat = this.toRadians(lat2 - lat1);
    const dLng = this.toRadians(lng2 - lng1);
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(this.toRadians(lat1)) * Math.cos(this.toRadians(lat2)) *
              Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  },

  toRadians(degrees) {
    return degrees * (Math.PI / 180);
  },

  // 获取配送费
  getDeliveryFee(orderAmount) {
    if (orderAmount >= this.freeDeliveryThreshold) {
      return 0;
    }
    return this.deliveryFee;
  },

  // 检查是否营业
  isOpen() {
    if (this.status !== 'active') {
      return false;
    }
    
    const now = new Date();
    const dayOfWeek = now.getDay();
    const currentTime = now.getHours() * 60 + now.getMinutes();
    
    const businessHours = this.businessHours[dayOfWeek];
    if (!businessHours || !businessHours.open) {
      return false;
    }
    
    const openTime = businessHours.openTime;
    const closeTime = businessHours.closeTime;
    
    if (openTime && closeTime) {
      const openMinutes = this.timeToMinutes(openTime);
      const closeMinutes = this.timeToMinutes(closeTime);
      
      return currentTime >= openMinutes && currentTime <= closeMinutes;
    }
    
    return true;
  },

  timeToMinutes(timeStr) {
    const [hours, minutes] = timeStr.split(':').map(Number);
    return hours * 60 + minutes;
  }
};

// 类方法
Merchant.findByCategory = function(category) {
  return this.findAll({
    where: { 
      category,
      status: 'active'
    },
    order: [['rating', 'DESC'], ['order_count', 'DESC']]
  });
};

Merchant.findNearby = function(lat, lng, radius = 5000) {
  return this.findAll({
    where: {
      status: 'active'
    },
    attributes: {
      include: [
        [
          sequelize.literal(`(
            6371000 * acos(
              cos(radians(${lat})) * cos(radians(latitude)) *
              cos(radians(longitude) - radians(${lng})) +
              sin(radians(${lat})) * sin(radians(latitude))
            )
          )`),
          'distance'
        ]
      ]
    },
    having: sequelize.literal(`distance <= ${radius}`),
    order: [['distance', 'ASC']]
  });
};

Merchant.getTopRated = function(limit = 10) {
  return this.findAll({
    where: {
      status: 'active'
    },
    order: [['rating', 'DESC'], ['order_count', 'DESC']],
    limit
  });
};

module.exports = Merchant;