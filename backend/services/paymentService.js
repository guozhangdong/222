const crypto = require('crypto');
const axios = require('axios');
const logger = require('../utils/logger');
const { redis } = require('../config/redis');

class PaymentService {
  constructor() {
    this.appId = process.env.WX_APPID;
    this.mchId = process.env.WX_MCH_ID;
    this.payKey = process.env.WX_PAY_KEY;
    this.notifyUrl = process.env.WX_NOTIFY_URL;
    this.refundNotifyUrl = process.env.WX_REFUND_NOTIFY_URL;
    this.certPath = process.env.WX_PAY_CERT_PATH;
  }

  // 生成随机字符串
  generateNonceStr(length = 32) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  // 生成签名
  generateSign(params, key) {
    // 1. 参数排序
    const sortedKeys = Object.keys(params).sort();
    
    // 2. 拼接字符串
    let signStr = '';
    sortedKeys.forEach(key => {
      if (params[key] !== '' && params[key] != null && key !== 'sign') {
        signStr += `${key}=${params[key]}&`;
      }
    });
    signStr += `key=${key}`;
    
    // 3. MD5加密并转大写
    return crypto.createHash('md5').update(signStr, 'utf8').digest('hex').toUpperCase();
  }

  // 验证签名
  verifySign(params, sign) {
    const calculatedSign = this.generateSign(params, this.payKey);
    return calculatedSign === sign;
  }

  // 统一下单
  async createUnifiedOrder(orderData) {
    try {
      const {
        orderNo,
        totalFee,
        openid,
        body = '邻·生活订单',
        attach = ''
      } = orderData;

      const params = {
        appid: this.appId,
        mch_id: this.mchId,
        nonce_str: this.generateNonceStr(),
        body: body,
        out_trade_no: orderNo,
        total_fee: Math.round(totalFee * 100), // 转换为分
        spbill_create_ip: '127.0.0.1',
        notify_url: this.notifyUrl,
        trade_type: 'JSAPI',
        openid: openid,
        attach: attach
      };

      // 生成签名
      params.sign = this.generateSign(params, this.payKey);

      // 构建XML
      const xmlData = this.buildXML(params);

      // 发送请求
      const response = await axios.post('https://api.mch.weixin.qq.com/pay/unifiedorder', xmlData, {
        headers: {
          'Content-Type': 'application/xml'
        },
        timeout: 10000
      });

      // 解析响应
      const result = this.parseXML(response.data);

      logger.info('微信统一下单响应', {
        orderNo,
        result
      });

      if (result.return_code === 'SUCCESS' && result.result_code === 'SUCCESS') {
        return {
          prepay_id: result.prepay_id,
          nonce_str: result.nonce_str
        };
      } else {
        throw new Error(result.err_code_des || result.return_msg || '统一下单失败');
      }
    } catch (error) {
      logger.error('微信统一下单失败', {
        orderData,
        error: error.message
      });
      throw error;
    }
  }

  // 生成小程序支付参数
  generateMiniProgramPayParams(prepayId) {
    const params = {
      appId: this.appId,
      timeStamp: Math.floor(Date.now() / 1000).toString(),
      nonceStr: this.generateNonceStr(),
      package: `prepay_id=${prepayId}`,
      signType: 'MD5'
    };

    // 生成签名
    params.paySign = this.generateSign(params, this.payKey);

    return params;
  }

  // 查询订单
  async queryOrder(orderNo) {
    try {
      const params = {
        appid: this.appId,
        mch_id: this.mchId,
        out_trade_no: orderNo,
        nonce_str: this.generateNonceStr()
      };

      params.sign = this.generateSign(params, this.payKey);

      const xmlData = this.buildXML(params);

      const response = await axios.post('https://api.mch.weixin.qq.com/pay/orderquery', xmlData, {
        headers: {
          'Content-Type': 'application/xml'
        },
        timeout: 10000
      });

      const result = this.parseXML(response.data);

      logger.info('微信查询订单响应', {
        orderNo,
        result
      });

      return result;
    } catch (error) {
      logger.error('微信查询订单失败', {
        orderNo,
        error: error.message
      });
      throw error;
    }
  }

  // 申请退款
  async refund(refundData) {
    try {
      const {
        orderNo,
        refundNo,
        totalFee,
        refundFee,
        reason = ''
      } = refundData;

      const params = {
        appid: this.appId,
        mch_id: this.mchId,
        nonce_str: this.generateNonceStr(),
        out_trade_no: orderNo,
        out_refund_no: refundNo,
        total_fee: Math.round(totalFee * 100),
        refund_fee: Math.round(refundFee * 100),
        refund_desc: reason
      };

      params.sign = this.generateSign(params, this.payKey);

      const xmlData = this.buildXML(params);

      const response = await axios.post('https://api.mch.weixin.qq.com/secapi/pay/refund', xmlData, {
        headers: {
          'Content-Type': 'application/xml'
        },
        timeout: 10000,
        // 这里需要配置证书
        // httpsAgent: new https.Agent({
        //   pfx: fs.readFileSync(this.certPath),
        //   passphrase: this.mchId
        // })
      });

      const result = this.parseXML(response.data);

      logger.info('微信申请退款响应', {
        orderNo,
        refundNo,
        result
      });

      return result;
    } catch (error) {
      logger.error('微信申请退款失败', {
        refundData,
        error: error.message
      });
      throw error;
    }
  }

  // 处理支付回调
  async handlePaymentNotify(xmlData) {
    try {
      const params = this.parseXML(xmlData);
      
      logger.info('收到微信支付回调', params);

      // 验证签名
      if (!this.verifySign(params, params.sign)) {
        logger.error('微信支付回调签名验证失败', params);
        throw new Error('签名验证失败');
      }

      // 验证返回码
      if (params.return_code !== 'SUCCESS') {
        logger.error('微信支付回调返回码错误', params);
        throw new Error(params.return_msg || '支付失败');
      }

      // 验证业务结果
      if (params.result_code !== 'SUCCESS') {
        logger.error('微信支付回调业务结果错误', params);
        throw new Error(params.err_code_des || '支付失败');
      }

      // 验证订单金额
      const orderNo = params.out_trade_no;
      const totalFee = params.total_fee / 100; // 转换为元
      const transactionId = params.transaction_id;

      // 这里应该查询数据库验证订单金额
      // const order = await Order.findByOrderNo(orderNo);
      // if (!order || order.total !== totalFee) {
      //   throw new Error('订单金额不匹配');
      // }

      // 缓存支付结果，防止重复处理
      const cacheKey = `payment_notify:${orderNo}`;
      const cached = await redis.get(cacheKey);
      if (cached) {
        logger.warn('重复的支付回调', { orderNo });
        return { success: true, message: '重复回调' };
      }

      // 缓存5分钟
      await redis.setex(cacheKey, 300, JSON.stringify(params));

      return {
        success: true,
        orderNo,
        totalFee,
        transactionId,
        openid: params.openid,
        attach: params.attach
      };
    } catch (error) {
      logger.error('处理微信支付回调失败', {
        xmlData,
        error: error.message
      });
      throw error;
    }
  }

  // 处理退款回调
  async handleRefundNotify(xmlData) {
    try {
      const params = this.parseXML(xmlData);
      
      logger.info('收到微信退款回调', params);

      // 验证签名
      if (!this.verifySign(params, params.sign)) {
        logger.error('微信退款回调签名验证失败', params);
        throw new Error('签名验证失败');
      }

      // 解密退款信息
      const refundInfo = this.decryptRefundInfo(params.req_info);

      logger.info('解密后的退款信息', refundInfo);

      if (refundInfo.refund_status === 'SUCCESS') {
        return {
          success: true,
          orderNo: refundInfo.out_trade_no,
          refundNo: refundInfo.out_refund_no,
          refundFee: refundInfo.refund_fee / 100,
          totalFee: refundInfo.total_fee / 100
        };
      } else {
        throw new Error('退款失败');
      }
    } catch (error) {
      logger.error('处理微信退款回调失败', {
        xmlData,
        error: error.message
      });
      throw error;
    }
  }

  // 解密退款信息
  decryptRefundInfo(encryptedData) {
    try {
      // 使用MD5对商户key进行32位加密
      const key = crypto.createHash('md5').update(this.payKey, 'utf8').digest('hex');
      
      // 解密
      const decipher = crypto.createDecipher('aes-256-ecb', key);
      let decrypted = decipher.update(encryptedData, 'base64', 'utf8');
      decrypted += decipher.final('utf8');
      
      return this.parseXML(decrypted);
    } catch (error) {
      logger.error('解密退款信息失败', error);
      throw new Error('解密失败');
    }
  }

  // 构建XML
  buildXML(obj) {
    let xml = '<xml>';
    for (const key in obj) {
      if (obj[key] !== undefined && obj[key] !== null) {
        xml += `<${key}>${obj[key]}</${key}>`;
      }
    }
    xml += '</xml>';
    return xml;
  }

  // 解析XML
  parseXML(xml) {
    // 简单的XML解析，实际项目中建议使用xml2js等库
    const result = {};
    const matches = xml.match(/<(\w+)>(.*?)<\/\1>/g);
    
    if (matches) {
      matches.forEach(match => {
        const key = match.match(/<(\w+)>/)[1];
        const value = match.replace(/<\/?(\w+)>/g, '');
        result[key] = value;
      });
    }
    
    return result;
  }

  // 生成退款单号
  generateRefundNo() {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
    return `RF${year}${month}${day}${random}`;
  }
}

module.exports = new PaymentService();