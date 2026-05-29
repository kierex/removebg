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
    // Primary API credentials
    primary: {
      api_key: "882a8490361da98702bf97a021ddc14d",
      secret: "62f8ce9f74b12f84c123cc23437a4a32"
    },
    // Backup API credentials
    backup: {
      api_key: "3e7c6f8a9b2d4e1f5a8c7b3d9e2f4a6b",
      secret: "c8f9e2a4b6d8f1e3c5a7b9d1e3f5c7a9"
    },
    // Secondary backup
    secondary: {
      api_key: "7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d",
      secret: "f1e2d3c4b5a6f7e8d9c0b1a2f3e4d5c6"
    },
    // Tertiary backup
    tertiary: {
      api_key: "b8c7d6e5f4a3b2c1d0e9f8a7b6c5d4e3",
      secret: "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6"
    }
  },
  rateLimit: {
    windowMs: 60 * 1000, // 1 minute
    maxAccounts: 5, // max 5 accounts per minute
    maxEmailGen: 30 // max 30 email generations per minute
  },
  apiRetry: {
    maxRetries: 3,
    retryDelay: 1000 // 1 second
  }
};

// ==================== CACHE SETUP ====================
const accountCache = new NodeCache({ stdTTL: 3600, checkperiod: 600 });
const emailCache = new NodeCache({ stdTTL: 1800, checkperiod: 300 });
const rateLimitCache = new NodeCache({ stdTTL: 60, checkperiod: 30 });
const failedKeysCache = new NodeCache({ stdTTL: 300, checkperiod: 60 }); // Track failed keys for 5 minutes

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
  }
};

// ==================== FACEBOOK CREATION FUNCTIONS WITH BACKUP KEYS ====================
const facebook = {
  // Get available API keys (excluding failed ones)
  getAvailableApiKeys() {
    const allKeys = [
      { name: 'primary', ...config.facebook.primary },
      { name: 'backup', ...config.facebook.backup },
      { name: 'secondary', ...config.facebook.secondary },
      { name: 'tertiary', ...config.facebook.tertiary }
    ];
    
    // Filter out keys that have failed recently
    return allKeys.filter(key => !failedKeysCache.get(key.name));
  },

  // Mark a key as failed
  markKeyFailed(keyName) {
    console.log(`⚠️ Marking ${keyName} API key as failed`);
    failedKeysCache.set(keyName, { failedAt: new Date().toISOString() });
  },

  async createAccountWithRetry(options = {}, retryCount = 0) {
    const availableKeys = this.getAvailableApiKeys();
    
    if (availableKeys.length === 0) {
      console.error('❌ No available API keys! All keys have failed.');
      // Clear failed keys cache after all keys fail to try again
      failedKeysCache.flushAll();
      return {
        success: false,
        error: 'All API keys are currently unavailable. Please try again.'
      };
    }

    // Try each available key
    for (const keyConfig of availableKeys) {
      try {
        console.log(`🔄 Trying ${keyConfig.name} API key...`);
        
        const result = await this.createAccountWithKey(options, keyConfig);
        
        if (result.success) {
          console.log(`✅ Successfully created account using ${keyConfig.name} key`);
          return result;
        } else {
          // Check if error indicates invalid key
          if (result.error && (
            result.error.includes('invalid') || 
            result.error.includes('unauthorized') ||
            result.error.includes('auth') ||
            result.error.includes('permission')
          )) {
            console.log(`❌ ${keyConfig.name} key failed due to auth error`);
            this.markKeyFailed(keyConfig.name);
          } else if (result.error && result.error.includes('rate_limit')) {
            console.log(`⚠️ Rate limit hit for ${keyConfig.name} key, trying next...`);
            await utils.sleep(1000);
            continue;
          } else {
            // Non-auth error, still try next key
            console.log(`⚠️ ${keyConfig.name} key failed: ${result.error}`);
            continue;
          }
        }
      } catch (error) {
        console.error(`❌ Error with ${keyConfig.name} key:`, error.message);
        continue;
      }
    }

    // If we get here and retryCount is less than maxRetries, retry
    if (retryCount < config.apiRetry.maxRetries) {
      console.log(`🔄 Retrying account creation (attempt ${retryCount + 1}/${config.apiRetry.maxRetries})...`);
      await utils.sleep(config.apiRetry.retryDelay);
      return this.createAccountWithRetry(options, retryCount + 1);
    }

    return {
      success: false,
      error: 'All API keys failed. Please try again later.'
    };
  },

  async createAccountWithKey(options, keyConfig) {
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
            apiKeyUsed: keyConfig.name
          },
          raw: response.data
        };
      } else {
        return {
          success: false,
          error: response.data.error_msg || response.data.error || 'Registration failed'
        };
      }
    } catch (error) {
      console.error('Facebook creation error:', error.message);
      return {
        success: false,
        error: error.response?.data?.error_msg || error.message
      };
    }
  },

  // Main create account method with automatic key rotation
  async createAccount(options = {}) {
    return this.createAccountWithRetry(options);
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
      total: 4,
      available: availableKeys.length,
      availableKeys: availableKeys.map(k => k.name)
    }
  });
});

// Create Facebook account
app.post('/api/fbcreate', rateLimiter('account'), async (req, res) => {
  try {
    const { email, firstName, lastName, gender, password } = req.body;

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

    const result = await facebook.createAccount({
      email,
      firstName,
      lastName,
      gender,
      password
    });

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
        apiKeyUsed: account.apiKeyUsed
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

// Check inbox (simulated for demo)
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
    
    // Simulate inbox messages
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
          total: 4,
          available: availableKeys.length,
          availableList: availableKeys.map(k => k.name)
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

// Donors list (static for now)
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

// API keys status endpoint
app.get('/api/keys/status', (req, res) => {
  const availableKeys = facebook.getAvailableApiKeys();
  const failedKeys = ['primary', 'backup', 'secondary', 'tertiary'].filter(
    key => failedKeysCache.get(key)
  );

  res.json({
    success: true,
    data: {
      available: availableKeys.map(k => ({
        name: k.name,
        status: 'active'
      })),
      failed: failedKeys.map(key => ({
        name: key,
        status: 'failed',
        retryAfter: '5 minutes'
      })),
      total: 4,
      availableCount: availableKeys.length
    }
  });
});

// Reset failed keys (admin endpoint)
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

// 404 handler
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
  console.log(`🔑 API Keys Status: ${facebook.getAvailableApiKeys().length}/4 available`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully');
  process.exit(0);
});

module.exports = app;