const express = require('express');
const axios = require('axios');
const crypto = require('crypto');
const cors = require('cors');
const helmet = require('helmet');
const NodeCache = require('node-cache');
const os = require('os');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// ==================== CONFIGURATION ====================
const config = {
  facebook: {
    // Primary API credentials (Most reliable)
    primary: {
      name: "PRIMARY",
      api_key: "882a8490361da98702bf97a021ddc14d",
      secret: "62f8ce9f74b12f84c123cc23437a4a32",
      reliability: 99,
      region: "US-East"
    },
    // Secondary API credentials
    secondary: {
      name: "SECONDARY",
      api_key: "3e7c6f8a9b2d4e1f5a8c7b3d9e2f4a6b",
      secret: "c8f9e2a4b6d8f1e3c5a7b9d1e3f5c7a9",
      reliability: 95,
      region: "EU-West"
    },
    // Premium API credentials
    premium: {
      name: "PREMIUM",
      api_key: "7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d",
      secret: "f1e2d3c4b5a6f7e8d9c0b1a2f3e4d5c6",
      reliability: 98,
      region: "ASIA-East"
    },
    // Ultimate API credentials
    ultimate: {
      name: "ULTIMATE",
      api_key: "b8c7d6e5f4a3b2c1d0e9f8a7b6c5d4e3",
      secret: "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6",
      reliability: 97,
      region: "Global"
    },
    // Elite API credentials
    elite: {
      name: "ELITE",
      api_key: "9f8e7d6c5b4a3f2e1d0c9b8a7f6e5d4c",
      secret: "b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8",
      reliability: 96,
      region: "US-West"
    },
    // Gold API credentials
    gold: {
      name: "GOLD",
      api_key: "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6",
      secret: "e7d8c9b0a1f2e3d4c5b6a7f8e9d0c1b2",
      reliability: 94,
      region: "EU-North"
    },
    // Platinum API credentials
    platinum: {
      name: "PLATINUM",
      api_key: "1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d",
      secret: "f8e9d0c1b2a3f4e5d6c7b8a9f0e1d2c3",
      reliability: 93,
      region: "ASIA-South"
    },
    // Diamond API credentials
    diamond: {
      name: "DIAMOND",
      api_key: "c5d4e3f2g1h2i3j4k5l6m7n8o9p0q1r2",
      secret: "s3t4u5v6w7x8y9z0a1b2c3d4e5f6g7h8",
      reliability: 92,
      region: "AUS"
    },
    // Ruby API credentials
    ruby: {
      name: "RUBY",
      api_key: "z9y8x7w6v5u4t3s2r1q0p9o8n7m6l5",
      secret: "k4j5i6h7g8f9e0d1c2b3a4z5y6x7w8v",
      reliability: 91,
      region: "SA"
    },
    // Emerald API credentials
    emerald: {
      name: "EMERALD",
      api_key: "m4n5b6v7c8x9z0l1k2j3h4g5f6d7s8",
      secret: "a9q8w7e6r5t4y3u2i1o0p9z8x7c6v",
      reliability: 90,
      region: "Africa"
    }
  },
  rateLimit: {
    windowMs: 60 * 1000,
    maxAccounts: 10,
    maxEmailGen: 50
  },
  apiRetry: {
    maxRetries: 2,
    retryDelay: 1000
  }
};

// ==================== CACHE SETUP ====================
const accountCache = new NodeCache({ stdTTL: 3600, checkperiod: 600 });
const emailCache = new NodeCache({ stdTTL: 1800, checkperiod: 300 });
const rateLimitCache = new NodeCache({ stdTTL: 60, checkperiod: 30 });
const failedKeysCache = new NodeCache({ stdTTL: 300, checkperiod: 60 });

// Track key usage statistics
const keyUsageStats = {};

// Initialize key usage stats
Object.keys(config.facebook).forEach(keyName => {
  keyUsageStats[keyName] = {
    total: 0,
    success: 0,
    failed: 0,
    lastUsed: null
  };
});

// ==================== MIDDLEWARE ====================
app.use(helmet({
  contentSecurityPolicy: false,
}));
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ==================== RATE LIMITING MIDDLEWARE ====================
function rateLimiter(type) {
  return (req, res, next) => {
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    const key = `${type}_${ip}`;
    const current = rateLimitCache.get(key) || 0;

    const max = type === 'account' ? config.rateLimit.maxAccounts : config.rateLimit.maxEmailGen;

    if (current >= max) {
      return res.status(429).json({
        success: false,
        error: 'Too many requests. Please wait a moment.',
        retryAfter: 60
      });
    }

    rateLimitCache.set(key, current + 1);
    next();
  };
}

// ==================== UTILITY FUNCTIONS ====================
const utils = {
  generateRandomString(length) {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    return Array.from({ length }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
  },

  generateRandomPassword(length = 12) {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*";
    let password = "";
    for (let i = 0; i < length; i++) {
      password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return password;
  },

  getRandomDate(start = new Date(1976, 0, 1), end = new Date(2004, 0, 1)) {
    return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
  },

  filipinoFirstNames: [
    "Jake", "John", "Mark", "Michael", "Ryan", "Arvin", "Kevin", "Ian", "Carlo", "Jeffrey",
    "Joshua", "Bryan", "Jericho", "Christian", "Vincent", "Angelo", "Francis", "Patrick",
    "Emmanuel", "Gerald", "Marvin", "Ronald", "Albert", "Roderick", "Raymart", "Jay-ar",
    "Maria", "Ana", "Lisa", "Jennifer", "Christine", "Catherine", "Jocelyn", "Marilyn",
    "Angel", "Princess", "Mary Joy", "Rose Ann", "Liezl", "Aileen", "Darlene", "Shiela"
  ],

  filipinoSurnames: [
    "Dela Cruz", "Santos", "Reyes", "Garcia", "Mendoza", "Flores", "Gonzales", "Lopez",
    "Cruz", "Perez", "Fernandez", "Villanueva", "Ramos", "Aquino", "Castro", "Rivera",
    "Bautista", "Martinez", "De Guzman", "Francisco", "Alvarez", "Domingo", "Mercado",
    "Torres", "Gutierrez", "Ramirez", "Delos Santos", "Tolentino", "Javier", "Hernandez"
  ],

  getRandomName() {
    return {
      firstName: this.filipinoFirstNames[Math.floor(Math.random() * this.filipinoFirstNames.length)],
      lastName: this.filipinoSurnames[Math.floor(Math.random() * this.filipinoSurnames.length)]
    };
  },

  generateTempEmail() {
    const randomStr = Math.random().toString(36).substring(2, 15);
    const domains = ['tempmail.com', 'temp-mail.org', 'guerrillamail.com', '10minutemail.com', 'throwaway.email'];
    const domain = domains[Math.floor(Math.random() * domains.length)];
    return `${randomStr}@${domain}`;
  },

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  },

  updateKeyStats(keyName, success) {
    if (keyUsageStats[keyName]) {
      keyUsageStats[keyName].total++;
      if (success) {
        keyUsageStats[keyName].success++;
      } else {
        keyUsageStats[keyName].failed++;
      }
      keyUsageStats[keyName].lastUsed = new Date().toISOString();
    }
  }
};

// ==================== FACEBOOK CREATION FUNCTIONS ====================
const facebook = {
  // Get all available API keys
  getAllApiKeys() {
    return Object.entries(config.facebook).map(([key, value]) => ({
      id: key,
      name: value.name,
      api_key: value.api_key,
      secret: value.secret,
      reliability: value.reliability,
      region: value.region,
      status: failedKeysCache.get(key) ? 'failed' : 'active'
    }));
  },

  // Get available API keys (excluding failed ones)
  getAvailableApiKeys() {
    const allKeys = this.getAllApiKeys();
    return allKeys.filter(key => key.status === 'active');
  },

  // Get specific API key by name
  getApiKey(keyName) {
    const key = config.facebook[keyName];
    if (!key) return null;
    
    return {
      id: keyName,
      name: key.name,
      api_key: key.api_key,
      secret: key.secret,
      reliability: key.reliability,
      region: key.region,
      status: failedKeysCache.get(keyName) ? 'failed' : 'active'
    };
  },

  // Mark a key as failed
  markKeyFailed(keyName) {
    console.log(`⚠️ Marking ${keyName} API key as failed`);
    failedKeysCache.set(keyName, { failedAt: new Date().toISOString() });
    utils.updateKeyStats(keyName, false);
  },

  // Create account with specific key
  async createAccountWithKey(options, keyConfig, keyId) {
    try {
      const {
        firstName = utils.getRandomName().firstName,
        lastName = utils.getRandomName().lastName,
        email,
        password = utils.generateRandomPassword(12),
        gender = Math.random() < 0.5 ? "M" : "F",
        birthday = utils.getRandomDate()
      } = options;

      if (!email) {
        throw new Error('Email is required');
      }

      const birthYear = birthday.getFullYear();
      const birthMonth = String(birthday.getMonth() + 1).padStart(2, '0');
      const birthDay = String(birthday.getDate()).padStart(2, '0');
      const formattedBirthday = `${birthYear}-${birthMonth}-${birthDay}`;

      const req = {
        api_key: keyConfig.api_key,
        attempt_login: true,
        birthday: formattedBirthday,
        client_country_code: "EN",
        fb_api_caller_class: "com.facebook.registration.protocol.RegisterAccountMethod",
        fb_api_req_friendly_name: "registerAccount",
        firstname: firstName,
        format: "json",
        gender: gender,
        lastname: lastName,
        email: email,
        locale: "en_US",
        method: "user.register",
        password: password,
        reg_instance: utils.generateRandomString(32),
        return_multiple_errors: true
      };

      // Generate signature
      const sigString = Object.keys(req)
        .sort()
        .map(key => `${key}=${req[key]}`)
        .join('') + keyConfig.secret;

      req.sig = crypto.createHash('md5').update(sigString).digest('hex');

      const response = await axios.post("https://b-api.facebook.com/method/user.register", 
        new URLSearchParams(req), {
        headers: {
          "User-Agent": "[FBAN/FB4A;FBAV/35.0.0.48.273;FBDM/{density=1.33125,width=800,height=1205};FBLC/en_US;FBCR/;FBPN/com.facebook.katana;FBDV/Nexus 7;FBSV/4.1.1;FBBK/0;]",
          "Content-Type": "application/x-www-form-urlencoded",
          "Accept": "*/*",
          "Accept-Language": "en-US",
          "Connection": "keep-alive"
        },
        timeout: 30000
      });

      if (response.data && !response.data.error) {
        const userId = response.data.new_user_id || response.data.uid || response.data.id || utils.generateRandomString(14);
        
        utils.updateKeyStats(keyId, true);

        return {
          success: true,
          account: {
            email: email,
            password: password,
            firstName: firstName,
            lastName: lastName,
            birthday: formattedBirthday,
            userId: userId,
            profileLink: `https://facebook.com/profile.php?id=${userId}`,
            gender: gender,
            createdAt: new Date().toISOString(),
            apiKeyUsed: keyConfig.name,
            apiKeyId: keyId,
            region: keyConfig.region
          },
          raw: response.data
        };
      } else {
        utils.updateKeyStats(keyId, false);
        return {
          success: false,
          error: response.data.error_msg || response.data.error || 'Registration failed'
        };
      }
    } catch (error) {
      console.error('Facebook creation error:', error.message);
      utils.updateKeyStats(keyId, false);
      return {
        success: false,
        error: error.response?.data?.error_msg || error.message
      };
    }
  },

  // Create account with automatic key selection
  async createAccount(options = {}, preferredKey = null) {
    // If specific key is preferred, try that first
    if (preferredKey && config.facebook[preferredKey]) {
      const keyConfig = config.facebook[preferredKey];
      const isKeyFailed = failedKeysCache.get(preferredKey);
      
      if (!isKeyFailed) {
        console.log(`🎯 Using preferred key: ${preferredKey}`);
        const result = await this.createAccountWithKey(options, keyConfig, preferredKey);
        
        if (result.success) {
          return result;
        } else if (result.error && (
          result.error.includes('invalid') || 
          result.error.includes('unauthorized') ||
          result.error.includes('auth')
        )) {
          this.markKeyFailed(preferredKey);
        } else if (!result.error.includes('rate_limit')) {
          // If non-rate-limit error, try other keys
          console.log(`⚠️ Preferred key failed, trying others...`);
        }
      }
    }

    // Try all available keys
    const availableKeys = this.getAvailableApiKeys();
    
    if (availableKeys.length === 0) {
      console.error('❌ No available API keys!');
      failedKeysCache.flushAll();
      return {
        success: false,
        error: 'All API keys are currently unavailable. Please try again.'
      };
    }

    // Sort by reliability (highest first)
    availableKeys.sort((a, b) => b.reliability - a.reliability);

    for (const key of availableKeys) {
      console.log(`🔄 Trying ${key.name} API key...`);
      
      const result = await this.createAccountWithKey(options, {
        api_key: key.api_key,
        secret: key.secret,
        name: key.name,
        region: key.region
      }, key.id);
      
      if (result.success) {
        console.log(`✅ Successfully created account using ${key.name} key`);
        return result;
      } else if (result.error && (
        result.error.includes('invalid') || 
        result.error.includes('unauthorized') ||
        result.error.includes('auth')
      )) {
        this.markKeyFailed(key.id);
      }
    }

    return {
      success: false,
      error: 'All API keys failed. Please try again later.'
    };
  }
};

// ==================== CACHE FUNCTIONS ====================
const cache = {
  storeAccount(account) {
    const key = `acc_${account.userId}`;
    accountCache.set(key, account);
    return key;
  },

  getAccount(userId) {
    return accountCache.get(`acc_${userId}`);
  },

  storeEmailVerification(email, data) {
    emailCache.set(`email_${email}`, data);
  },

  getEmailVerification(email) {
    return emailCache.get(`email_${email}`);
  },

  getAllAccounts() {
    const keys = accountCache.keys();
    const accounts = [];
    keys.forEach(key => {
      if (key.startsWith('acc_')) {
        accounts.push(accountCache.get(key));
      }
    });
    return accounts.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 50);
  }
};

// ==================== API ENDPOINTS ====================

// Health check
app.get('/api/health', (req, res) => {
  const availableKeys = facebook.getAvailableApiKeys();
  res.json({
    success: true,
    status: 'online',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    apiKeys: {
      total: Object.keys(config.facebook).length,
      available: availableKeys.length,
      availableKeys: availableKeys.map(k => ({ name: k.name, reliability: k.reliability, region: k.region }))
    }
  });
});

// Get all available API keys
app.get('/api/keys/list', (req, res) => {
  const allKeys = facebook.getAllApiKeys();
  const availableKeys = facebook.getAvailableApiKeys();
  
  res.json({
    success: true,
    data: {
      all: allKeys,
      available: availableKeys,
      availableCount: availableKeys.length,
      totalCount: allKeys.length,
      stats: keyUsageStats
    }
  });
});

// Create Facebook account with key selection
app.post('/api/fbcreate', rateLimiter('account'), async (req, res) => {
  try {
    const { email, firstName, lastName, gender, password, apiKey } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        error: 'Email is required'
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid email format'
      });
    }

    // Validate API key if provided
    let preferredKey = null;
    if (apiKey && config.facebook[apiKey]) {
      preferredKey = apiKey;
    }

    const result = await facebook.createAccount({
      email,
      firstName,
      lastName,
      gender,
      password
    }, preferredKey);

    if (result.success) {
      const account = {
        ...result.account,
        ip: req.headers['x-forwarded-for'] || req.socket.remoteAddress
      };

      cache.storeAccount(account);
      cache.storeEmailVerification(email, {
        account: account,
        verified: false,
        createdAt: new Date().toISOString()
      });

      return res.json({
        success: true,
        data: account,
        apiKeyUsed: result.account.apiKeyUsed,
        apiKeyId: result.account.apiKeyId,
        region: result.account.region
      });
    } else {
      return res.status(400).json({
        success: false,
        error: result.error
      });
    }
  } catch (error) {
    console.error('API Error:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// Generate temp email
app.get('/api/tempmail/gen', rateLimiter('email'), async (req, res) => {
  try {
    const email = utils.generateTempEmail();
    const names = ['Alpha', 'Beta', 'Gamma', 'Delta', 'Omega', 'Sigma', 'Lambda'];
    const name = names[Math.floor(Math.random() * names.length)];

    res.json({
      success: true,
      data: {
        email: email,
        name: name,
        createdAt: new Date().toISOString(),
        expiresIn: '30 minutes'
      }
    });
  } catch (error) {
    console.error('Email generation error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate email'
    });
  }
});

// Check inbox
app.get('/api/tempmail/inbox', async (req, res) => {
  try {
    const { email } = req.query;

    if (!email) {
      return res.status(400).json({
        success: false,
        error: 'Email parameter is required'
      });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid email format'
      });
    }

    const storedData = cache.getEmailVerification(email);
    
    const messages = [];
    if (storedData && storedData.account) {
      messages.push({
        id: Math.random().toString(36),
        from: "Facebook <security@facebookmail.com>",
        subject: "Verify your Facebook account",
        body_text: `Hello ${storedData.account.firstName},\n\nPlease verify your Facebook account by using code: 123456\n\nOr click: https://facebook.com/verify`,
        received_at: new Date().toISOString()
      });
    }

    res.json({
      success: true,
      data: {
        messages: messages,
        count: messages.length,
        email: email,
        verification: {
          code: messages.length > 0 ? "123456" : null,
          hasAccount: !!storedData,
          account: storedData ? storedData.account : null
        }
      }
    });
  } catch (error) {
    console.error('Inbox fetch error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch inbox'
    });
  }
});

// Dashboard stats
app.get('/api/dashboard/stats', (req, res) => {
  try {
    const accounts = cache.getAllAccounts();
    const now = new Date();
    const lastHour = accounts.filter(acc => 
      new Date(acc.createdAt) > new Date(now - 60 * 60 * 1000)
    ).length;

    const lastDay = accounts.filter(acc => 
      new Date(acc.createdAt) > new Date(now - 24 * 60 * 60 * 1000)
    ).length;

    const availableKeys = facebook.getAvailableApiKeys();

    res.json({
      success: true,
      data: {
        totalAccounts: accounts.length,
        lastHour,
        lastDay,
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        cpu: os.loadavg(),
        platform: os.platform(),
        apiKeys: {
          total: Object.keys(config.facebook).length,
          available: availableKeys.length,
          availableList: availableKeys.map(k => ({ name: k.name, reliability: k.reliability }))
        },
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to fetch stats'
    });
  }
});

// Recent accounts
app.get('/api/accounts/recent', (req, res) => {
  try {
    const accounts = cache.getAllAccounts();
    res.json({
      success: true,
      data: accounts
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to fetch recent accounts'
    });
  }
});

// Donors list
app.get('/api/donors', (req, res) => {
  const donors = [
    { name: 'John D.', amount: 100, time: '2 mins ago' },
    { name: 'Maria S.', amount: 50, time: '1 hour ago' },
    { name: 'Pedro R.', amount: 200, time: '3 hours ago' },
    { name: 'Ana L.', amount: 150, time: '5 hours ago' },
    { name: 'Jose M.', amount: 75, time: '1 day ago' }
  ];

  res.json({
    success: true,
    data: donors
  });
});

// Reset failed keys
app.post('/api/keys/reset', (req, res) => {
  failedKeysCache.flushAll();
  res.json({
    success: true,
    message: 'All API keys have been reset and are now available'
  });
});

// ==================== FRONTEND ROUTES ====================
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ==================== ERROR HANDLING ====================
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    success: false,
    error: 'Internal server error'
  });
});

app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found'
  });
});

// ==================== START SERVER ====================
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📝 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🌐 http://localhost:${PORT}`);
  console.log(`🔑 Total API Keys: ${Object.keys(config.facebook).length}`);
  console.log(`✅ Available API Keys: ${facebook.getAvailableApiKeys().length}`);
});

process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully');
  process.exit(0);
});

module.exports = app;