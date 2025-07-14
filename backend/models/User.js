const { DataTypes } = require('sequelize');
const bcrypt = require('bcryptjs');
const { sequelize } = require('../config/database');

const User = sequelize.define('User', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  openid: {
    type: DataTypes.STRING(100),
    unique: true,
    allowNull: false,
    comment: '微信openid'
  },
  unionid: {
    type: DataTypes.STRING(100),
    unique: true,
    allowNull: true,
    comment: '微信unionid'
  },
  nickname: {
    type: DataTypes.STRING(50),
    allowNull: true,
    comment: '用户昵称'
  },
  avatar: {
    type: DataTypes.STRING(500),
    allowNull: true,
    comment: '用户头像'
  },
  phone: {
    type: DataTypes.STRING(20),
    allowNull: true,
    unique: true,
    comment: '手机号'
  },
  email: {
    type: DataTypes.STRING(100),
    allowNull: true,
    unique: true,
    comment: '邮箱'
  },
  gender: {
    type: DataTypes.ENUM('male', 'female', 'unknown'),
    defaultValue: 'unknown',
    comment: '性别'
  },
  birthday: {
    type: DataTypes.DATEONLY,
    allowNull: true,
    comment: '生日'
  },
  role: {
    type: DataTypes.ENUM('user', 'merchant', 'admin', 'super_admin'),
    defaultValue: 'user',
    comment: '用户角色'
  },
  status: {
    type: DataTypes.ENUM('active', 'inactive', 'banned'),
    defaultValue: 'active',
    comment: '用户状态'
  },
  level: {
    type: DataTypes.ENUM('bronze', 'silver', 'gold', 'platinum'),
    defaultValue: 'bronze',
    comment: '会员等级'
  },
  points: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    comment: '积分余额'
  },
  totalPoints: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    comment: '累计积分'
  },
  totalSpent: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 0.00,
    comment: '累计消费金额'
  },
  lastSignInAt: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: '最后签到时间'
  },
  signInCount: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    comment: '连续签到天数'
  },
  lastLoginAt: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: '最后登录时间'
  },
  loginCount: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    comment: '登录次数'
  },
  inviteCode: {
    type: DataTypes.STRING(20),
    unique: true,
    allowNull: true,
    comment: '邀请码'
  },
  invitedBy: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: '邀请人ID'
  },
  inviteCount: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    comment: '邀请人数'
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
  address: {
    type: DataTypes.STRING(200),
    allowNull: true,
    comment: '详细地址'
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
  preferences: {
    type: DataTypes.JSON,
    defaultValue: {},
    comment: '用户偏好设置'
  },
  settings: {
    type: DataTypes.JSON,
    defaultValue: {},
    comment: '用户设置'
  },
  remark: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: '备注'
  }
}, {
  tableName: 'users',
  timestamps: true,
  indexes: [
    {
      fields: ['openid']
    },
    {
      fields: ['phone']
    },
    {
      fields: ['email']
    },
    {
      fields: ['role']
    },
    {
      fields: ['status']
    },
    {
      fields: ['level']
    },
    {
      fields: ['invite_code']
    },
    {
      fields: ['created_at']
    }
  ],
  hooks: {
    // 创建前生成邀请码
    beforeCreate: async (user) => {
      if (!user.inviteCode) {
        user.inviteCode = generateInviteCode();
      }
    },
    
    // 更新前处理
    beforeUpdate: async (user) => {
      // 如果消费金额变化，检查是否需要升级会员等级
      if (user.changed('totalSpent')) {
        user.level = calculateUserLevel(user.totalSpent);
      }
    }
  }
});

// 生成邀请码
function generateInviteCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 8; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// 计算用户等级
function calculateUserLevel(totalSpent) {
  const amount = parseFloat(totalSpent);
  if (amount >= 5000) return 'platinum';
  if (amount >= 1000) return 'gold';
  if (amount >= 500) return 'silver';
  return 'bronze';
}

// 实例方法
User.prototype = {
  // 增加积分
  async addPoints(points, reason = '') {
    this.points += points;
    this.totalPoints += points;
    await this.save();
    
    // 记录积分变动
    const { PointRecord } = require('./index');
    await PointRecord.create({
      userId: this.id,
      type: 'earn',
      points,
      reason,
      balance: this.points
    });
  },

  // 消费积分
  async usePoints(points, reason = '') {
    if (this.points < points) {
      throw new Error('积分不足');
    }
    
    this.points -= points;
    await this.save();
    
    // 记录积分变动
    const { PointRecord } = require('./index');
    await PointRecord.create({
      userId: this.id,
      type: 'spend',
      points: -points,
      reason,
      balance: this.points
    });
  },

  // 签到
  async signIn() {
    const today = new Date().toDateString();
    const lastSignIn = this.lastSignInAt ? new Date(this.lastSignInAt).toDateString() : null;
    
    if (lastSignIn === today) {
      throw new Error('今日已签到');
    }
    
    // 计算连续签到天数
    if (lastSignIn === new Date(Date.now() - 24 * 60 * 60 * 1000).toDateString()) {
      this.signInCount += 1;
    } else {
      this.signInCount = 1;
    }
    
    this.lastSignInAt = new Date();
    
    // 签到奖励积分
    const signInPoints = parseInt(process.env.SIGN_IN_POINTS) || 5;
    await this.addPoints(signInPoints, '签到奖励');
    
    await this.save();
    
    return {
      points: signInPoints,
      signInCount: this.signInCount
    };
  },

  // 更新消费金额
  async updateSpent(amount) {
    this.totalSpent = parseFloat(this.totalSpent) + parseFloat(amount);
    await this.save();
  },

  // 检查是否可以升级
  canUpgrade() {
    const currentLevel = this.level;
    const newLevel = calculateUserLevel(this.totalSpent);
    return newLevel !== currentLevel;
  },

  // 获取升级所需金额
  getUpgradeRequirement() {
    const requirements = {
      bronze: 500,
      silver: 1000,
      gold: 5000,
      platinum: null
    };
    
    const currentRequirement = requirements[this.level];
    if (!currentRequirement) return null;
    
    const remaining = currentRequirement - parseFloat(this.totalSpent);
    return remaining > 0 ? remaining : 0;
  }
};

// 类方法
User.findByOpenid = function(openid) {
  return this.findOne({ where: { openid } });
};

User.findByPhone = function(phone) {
  return this.findOne({ where: { phone } });
};

User.findByInviteCode = function(inviteCode) {
  return this.findOne({ where: { inviteCode } });
};

module.exports = User;