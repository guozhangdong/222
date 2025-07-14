const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Dish = sequelize.define('Dish', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  merchantId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: '商家ID'
  },
  categoryId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: '分类ID'
  },
  name: {
    type: DataTypes.STRING(100),
    allowNull: false,
    comment: '菜品名称'
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: '菜品描述'
  },
  images: {
    type: DataTypes.JSON,
    defaultValue: [],
    comment: '菜品图片'
  },
  price: {
    type: DataTypes.DECIMAL(8, 2),
    allowNull: false,
    comment: '菜品价格'
  },
  originalPrice: {
    type: DataTypes.DECIMAL(8, 2),
    allowNull: true,
    comment: '原价'
  },
  cost: {
    type: DataTypes.DECIMAL(8, 2),
    allowNull: true,
    comment: '成本价'
  },
  stock: {
    type: DataTypes.INTEGER,
    defaultValue: -1,
    comment: '库存数量(-1表示无限)'
  },
  soldCount: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    comment: '销售数量'
  },
  rating: {
    type: DataTypes.DECIMAL(2, 1),
    defaultValue: 5.0,
    comment: '评分'
  },
  ratingCount: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    comment: '评分数量'
  },
  tags: {
    type: DataTypes.JSON,
    defaultValue: [],
    comment: '标签'
  },
  attributes: {
    type: DataTypes.JSON,
    defaultValue: {},
    comment: '菜品属性(辣度、甜度等)'
  },
  specifications: {
    type: DataTypes.JSON,
    defaultValue: [],
    comment: '规格选项'
  },
  addons: {
    type: DataTypes.JSON,
    defaultValue: [],
    comment: '加料选项'
  },
  preparationTime: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    comment: '制作时间(分钟)'
  },
  status: {
    type: DataTypes.ENUM('active', 'inactive', 'sold_out'),
    defaultValue: 'active',
    comment: '菜品状态'
  },
  sort: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    comment: '排序'
  },
  isRecommend: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    comment: '是否推荐'
  },
  isHot: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    comment: '是否热门'
  },
  isNew: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    comment: '是否新品'
  },
  nutrition: {
    type: DataTypes.JSON,
    defaultValue: {},
    comment: '营养信息'
  },
  allergens: {
    type: DataTypes.JSON,
    defaultValue: [],
    comment: '过敏原'
  },
  remark: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: '备注'
  }
}, {
  tableName: 'dishes',
  timestamps: true,
  indexes: [
    {
      fields: ['merchant_id']
    },
    {
      fields: ['category_id']
    },
    {
      fields: ['status']
    },
    {
      fields: ['price']
    },
    {
      fields: ['rating']
    },
    {
      fields: ['sold_count']
    },
    {
      fields: ['is_recommend']
    },
    {
      fields: ['is_hot']
    },
    {
      fields: ['is_new']
    },
    {
      fields: ['created_at']
    }
  ]
});

// 实例方法
Dish.prototype = {
  // 更新评分
  async updateRating(newRating) {
    const totalRating = this.rating * this.ratingCount + newRating;
    this.ratingCount += 1;
    this.rating = totalRating / this.ratingCount;
    await this.save();
  },

  // 增加销售数量
  async incrementSoldCount(quantity = 1) {
    this.soldCount += quantity;
    await this.save();
  },

  // 减少库存
  async decreaseStock(quantity = 1) {
    if (this.stock !== -1) {
      if (this.stock < quantity) {
        throw new Error('库存不足');
      }
      this.stock -= quantity;
      await this.save();
    }
  },

  // 增加库存
  async increaseStock(quantity = 1) {
    if (this.stock !== -1) {
      this.stock += quantity;
      await this.save();
    }
  },

  // 检查是否有库存
  hasStock(quantity = 1) {
    return this.stock === -1 || this.stock >= quantity;
  },

  // 获取折扣信息
  getDiscount() {
    if (!this.originalPrice || this.originalPrice <= this.price) {
      return null;
    }
    
    const discount = ((this.originalPrice - this.price) / this.originalPrice * 100).toFixed(1);
    return {
      originalPrice: this.originalPrice,
      discountPrice: this.price,
      discountRate: discount
    };
  },

  // 获取规格价格
  getSpecificationPrice(specId) {
    const spec = this.specifications.find(s => s.id === specId);
    return spec ? spec.price : this.price;
  },

  // 获取加料价格
  getAddonPrice(addonIds) {
    if (!addonIds || !Array.isArray(addonIds)) {
      return 0;
    }
    
    let totalAddonPrice = 0;
    addonIds.forEach(addonId => {
      const addon = this.addons.find(a => a.id === addonId);
      if (addon) {
        totalAddonPrice += addon.price;
      }
    });
    
    return totalAddonPrice;
  },

  // 计算总价格
  calculateTotalPrice(specId = null, addonIds = [], quantity = 1) {
    let basePrice = this.price;
    
    if (specId) {
      basePrice = this.getSpecificationPrice(specId);
    }
    
    const addonPrice = this.getAddonPrice(addonIds);
    const totalPrice = (basePrice + addonPrice) * quantity;
    
    return totalPrice;
  }
};

// 类方法
Dish.findByMerchant = function(merchantId, options = {}) {
  const where = {
    merchantId,
    status: 'active'
  };
  
  if (options.categoryId) {
    where.categoryId = options.categoryId;
  }
  
  return this.findAll({
    where,
    order: [
      ['sort', 'ASC'],
      ['is_recommend', 'DESC'],
      ['sold_count', 'DESC']
    ]
  });
};

Dish.findRecommend = function(merchantId = null, limit = 10) {
  const where = {
    status: 'active',
    isRecommend: true
  };
  
  if (merchantId) {
    where.merchantId = merchantId;
  }
  
  return this.findAll({
    where,
    order: [['sold_count', 'DESC']],
    limit
  });
};

Dish.findHot = function(merchantId = null, limit = 10) {
  const where = {
    status: 'active',
    isHot: true
  };
  
  if (merchantId) {
    where.merchantId = merchantId;
  }
  
  return this.findAll({
    where,
    order: [['sold_count', 'DESC']],
    limit
  });
};

Dish.findNew = function(merchantId = null, limit = 10) {
  const where = {
    status: 'active',
    isNew: true
  };
  
  if (merchantId) {
    where.merchantId = merchantId;
  }
  
  return this.findAll({
    where,
    order: [['created_at', 'DESC']],
    limit
  });
};

Dish.search = function(keyword, merchantId = null, limit = 20) {
  const where = {
    status: 'active',
    [sequelize.Op.or]: [
      { name: { [sequelize.Op.like]: `%${keyword}%` } },
      { description: { [sequelize.Op.like]: `%${keyword}%` } },
      { tags: { [sequelize.Op.like]: `%${keyword}%` } }
    ]
  };
  
  if (merchantId) {
    where.merchantId = merchantId;
  }
  
  return this.findAll({
    where,
    order: [['sold_count', 'DESC']],
    limit
  });
};

module.exports = Dish;