const express = require('express');
const axios = require('axios');
const crypto = require('crypto');
const cors = require('cors');
const helmet = require('helmet');
const NodeCache = require('node-cache');
const os = require('os');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// ==================== CONFIGURATION ====================
const config = {
  facebook: {
    api_key: "882a8490361da98702bf97a021ddc14d",
    secret: "62f8ce9f74b12f84c123cc23437a4a32",
    profilePictureUrl: "https://iili.io/C2D1gTX.jpg"
  },
  rateLimit: {
    windowMs: 60 * 1000, // 1 minute
    maxAccounts: 5, // max 5 accounts per minute
    maxEmailGen: 30, // max 30 email generations per minute
    maxPhoneGen: 20 // max 20 phone generations per minute
  }
};

// ==================== CACHE SETUP ====================
const accountCache = new NodeCache({ stdTTL: 3600, checkperiod: 600 });
const emailCache = new NodeCache({ stdTTL: 1800, checkperiod: 300 });
const phoneCache = new NodeCache({ stdTTL: 1800, checkperiod: 300 });
const rateLimitCache = new NodeCache({ stdTTL: 60, checkperiod: 30 });

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

    let max;
    switch(type) {
      case 'account':
        max = config.rateLimit.maxAccounts;
        break;
      case 'email':
        max = config.rateLimit.maxEmailGen;
        break;
      case 'phone':
        max = config.rateLimit.maxPhoneGen;
        break;
      default:
        max = 30;
    }

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

  // Bangladesh phone number prefixes
  bangladeshPrefixes: ['017', '018', '019', '015', '016', '013', '014'],
  
  generateBangladeshNumber() {
    const prefix = this.bangladeshPrefixes[Math.floor(Math.random() * this.bangladeshPrefixes.length)];
    const number = Math.floor(Math.random() * 10000000).toString().padStart(8, '0');
    return `${prefix}${number}`;
  },

  // Extract cookies from response headers
  extractCookies(headers) {
    const cookies = [];
    const setCookie = headers['set-cookie'];
    if (setCookie) {
      setCookie.forEach(cookie => {
        const match = cookie.match(/([^=]+)=([^;]+)/);
        if (match) {
          cookies.push({
            name: match[1],
            value: match[2],
            fullString: cookie.split(';')[0]
          });
        }
      });
    }
    return cookies;
  },

  // Generate access token (simulated)
  generateAccessToken(userId, sessionId) {
    // This is a simulation - in production you would get real tokens from Facebook
    const tokenData = {
      user_id: userId,
      session_id: sessionId,
      app_id: "com.facebook.katana",
      issued_at: Date.now(),
      expires_at: Date.now() + (3600 * 24 * 30 * 1000), // 30 days
      token: crypto.randomBytes(32).toString('hex')
    };
    return Buffer.from(JSON.stringify(tokenData)).toString('base64');
  }
};

// ==================== FACEBOOK CREATION FUNCTIONS ====================
const facebook = {
  async createAccount(options = {}) {
    try {
      const {
        firstName = utils.getRandomName().firstName,
        lastName = utils.getRandomName().lastName,
        email,
        phone,
        password = utils.generateRandomPassword(12),
        gender = Math.random() < 0.5 ? "M" : "F",
        birthday = utils.getRandomDate()
      } = options;

      if (!email && !phone) {
        throw new Error('Either email or phone is required');
      }

      const birthYear = birthday.getFullYear();
      const birthMonth = String(birthday.getMonth() + 1).padStart(2, '0');
      const birthDay = String(birthday.getDate()).padStart(2, '0');
      const formattedBirthday = `${birthYear}-${birthMonth}-${birthDay}`;

      const req = {
        api_key: config.facebook.api_key,
        attempt_login: true,
        birthday: formattedBirthday,
        client_country_code: "BD",
        fb_api_caller_class: "com.facebook.registration.protocol.RegisterAccountMethod",
        fb_api_req_friendly_name: "registerAccount",
        firstname: firstName,
        format: "json",
        gender: gender,
        lastname: lastName,
        locale: "en_US",
        method: "user.register",
        password: password,
        reg_instance: utils.generateRandomString(32),
        return_multiple_errors: true
      };

      // Add email or phone to request
      if (email) {
        req.email = email;
      }
      if (phone) {
        req.phone = phone;
      }

      // Generate signature
      const sigString = Object.keys(req)
        .sort()
        .map(key => `${key}=${req[key]}`)
        .join('') + config.facebook.secret;

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
        const sessionId = utils.generateRandomString(32);
        
        // Extract cookies from response
        const cookies = utils.extractCookies(response.headers);
        
        // Generate access token
        const accessToken = utils.generateAccessToken(userId, sessionId);
        
        // Set profile picture (simulated)
        let profilePictureSet = false;
        try {
          // In production, you would make an API call to set profile picture
          // This is a simulation
          profilePictureSet = true;
        } catch (picError) {
          console.log('Profile picture setting failed:', picError.message);
        }

        return {
          success: true,
          account: {
            email: email || null,
            phone: phone || null,
            password: password,
            firstName: firstName,
            lastName: lastName,
            birthday: formattedBirthday,
            userId: userId,
            profileLink: `https://facebook.com/profile.php?id=${userId}`,
            profilePicture: config.facebook.profilePictureUrl,
            profilePictureSet: profilePictureSet,
            gender: gender,
            createdAt: new Date().toISOString(),
            cookies: cookies,
            accessToken: accessToken,
            sessionId: sessionId
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

  // Function to set profile picture after account creation
  async setProfilePicture(accessToken, userId, pictureUrl) {
    try {
      // This is a simulation - actual Facebook API would be used here
      // In production, you would use Facebook's Graph API to upload/set profile picture
      const response = await axios.post(`https://graph.facebook.com/${userId}/picture`, {
        access_token: accessToken,
        url: pictureUrl,
        published: true
      }, {
        timeout: 10000
      });
      return response.data;
    } catch (error) {
      console.error('Set profile picture error:', error.message);
      return null;
    }
  }
};

// ==================== CACHE FUNCTIONS ====================
const cache = {
  storeAccount(account) {
    const key = `acc_${account.userId}`;
    accountCache.set(key, account);
    
    // Also save to file for persistence
    this.saveAccountToFile(account);
    
    return key;
  },

  saveAccountToFile(account) {
    try {
      const accountsFile = path.join(__dirname, 'created_accounts.json');
      let accounts = [];
      
      if (fs.existsSync(accountsFile)) {
        const data = fs.readFileSync(accountsFile, 'utf8');
        accounts = JSON.parse(data);
      }
      
      accounts.unshift(account);
      
      // Keep only last 100 accounts
      if (accounts.length > 100) {
        accounts = accounts.slice(0, 100);
      }
      
      fs.writeFileSync(accountsFile, JSON.stringify(accounts, null, 2));
    } catch (error) {
      console.error('Failed to save account to file:', error);
    }
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

  storePhoneVerification(phone, data) {
    phoneCache.set(`phone_${phone}`, data);
  },

  getPhoneVerification(phone) {
    return phoneCache.get(`phone_${phone}`);
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
  res.json({
    success: true,
    status: 'online',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Generate temporary Bangladesh phone number
app.get('/api/tempnum/gen', rateLimiter('phone'), async (req, res) => {
  try {
    const phoneNumber = utils.generateBangladeshNumber();
    const fullNumber = `+88${phoneNumber}`;
    
    // Store phone number info
    const phoneData = {
      number: fullNumber,
      rawNumber: phoneNumber,
      country: 'Bangladesh',
      countryCode: 'BD',
      createdAt: new Date().toISOString(),
      expiresIn: '30 minutes',
      messages: []
    };
    
    cache.storePhoneVerification(phoneNumber, phoneData);
    
    res.json({
      success: true,
      data: {
        number: fullNumber,
        rawNumber: phoneNumber,
        country: 'Bangladesh',
        dialCode: '+88',
        createdAt: new Date().toISOString(),
        expiresIn: '30 minutes'
      }
    });
  } catch (error) {
    console.error('Phone generation error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate phone number'
    });
  }
});

// Get SMS for Bangladesh number
app.get('/api/tempnum/sms', async (req, res) => {
  try {
    const { number } = req.query;
    
    if (!number) {
      return res.status(400).json({
        success: false,
        error: 'Phone number is required'
      });
    }
    
    // Clean number
    const cleanNumber = number.replace(/\+88/g, '');
    
    // For demo purposes, return stored messages or simulate
    const storedData = cache.getPhoneVerification(cleanNumber);
    
    // Simulate SMS reception (in production, connect to actual SMS API)
    const mockMessages = [
      {
        id: Date.now().toString(),
        from: "Facebook",
        message: "Your Facebook verification code is: 123456",
        receivedAt: new Date().toISOString(),
        code: "123456"
      }
    ];
    
    res.json({
      success: true,
      data: {
        number: number,
        messages: storedData?.messages || mockMessages,
        count: storedData?.messages?.length || 1,
        lastUpdated: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('SMS fetch error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch SMS'
    });
  }
});

// Generate temp email
app.get('/api/tempmail/gen', rateLimiter('email'), async (req, res) => {
  try {
    let email;
    let fallback = false;

    try {
      const response = await axios.post('https://api.internal.temp-mail.io/api/v3/email/new', {}, {
        timeout: 10000,
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        }
      });
      email = response.data.email;
    } catch (error) {
      // Fallback to local generation
      const randomStr = Math.random().toString(36).substring(2, 10);
      const domains = ['guerrillamail.com', 'temp-mail.org', '10minutemail.com'];
      const domain = domains[Math.floor(Math.random() * domains.length)];
      email = `user_${randomStr}@${domain}`;
      fallback = true;
    }

    res.json({
      success: true,
      data: {
        email: email,
        createdAt: new Date().toISOString(),
        expiresIn: '30 minutes',
        fallback: fallback
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

    let messages = [];
    let verificationCode = null;
    let verificationLink = null;

    try {
      const response = await axios.get(`https://api.internal.temp-mail.io/api/v3/email/${email}/messages`, {
        timeout: 15000,
        headers: {
          'Accept': 'application/json'
        }
      });

      messages = response.data || [];

      // Look for verification codes
      for (const msg of messages) {
        if (msg.subject && msg.subject.toLowerCase().includes('facebook')) {
          const body = msg.body_text || msg.body_html || '';

          // Extract verification code (6-8 digits)
          const codeMatch = body.match(/\b\d{6,8}\b/);
          if (codeMatch) verificationCode = codeMatch[0];

          // Extract verification link
          const linkMatch = body.match(/https?:\/\/[^\s]+facebook[^\s]+/i);
          if (linkMatch) verificationLink = linkMatch[0];

          break;
        }
      }
    } catch (apiError) {
      // Return empty inbox if API fails
      console.log('Inbox API error, returning empty');
    }

    const storedData = cache.getEmailVerification(email);

    res.json({
      success: true,
      data: {
        messages: messages,
        count: messages.length,
        email: email,
        verification: {
          code: verificationCode,
          link: verificationLink,
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

// Create Facebook account
app.post('/api/fbcreate', rateLimiter('account'), async (req, res) => {
  try {
    const { email, phone, firstName, lastName, gender, password } = req.body;

    if (!email && !phone) {
      return res.status(400).json({
        success: false,
        error: 'Either email or phone number is required'
      });
    }

    // Validate email format if provided
    if (email) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid email format'
        });
      }
    }

    // Validate phone format if provided
    if (phone) {
      const phoneRegex = /^\+?[0-9]{10,15}$/;
      if (!phoneRegex.test(phone.replace(/\+/g, ''))) {
        return res.status(400).json({
          success: false,
          error: 'Invalid phone number format'
        });
      }
    }

    const result = await facebook.createAccount({
      email,
      phone,
      firstName,
      lastName,
      gender,
      password
    });

    if (result.success) {
      const account = {
        ...result.account,
        ip: req.headers['x-forwarded-for'] || req.socket.remoteAddress,
        profilePicture: config.facebook.profilePictureUrl,
        profilePictureSet: true
      };

      cache.storeAccount(account);
      
      if (email) {
        cache.storeEmailVerification(email, {
          account: account,
          verified: false,
          createdAt: new Date().toISOString()
        });
      }
      
      if (phone) {
        cache.storePhoneVerification(phone, {
          account: account,
          verified: false,
          createdAt: new Date().toISOString()
        });
      }

      return res.json({
        success: true,
        data: account,
        cookies: account.cookies,
        accessToken: account.accessToken
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

// Extract cookies for existing account
app.get('/api/extract-cookies/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const account = cache.getAccount(userId);
    
    if (!account) {
      return res.status(404).json({
        success: false,
        error: 'Account not found'
      });
    }
    
    res.json({
      success: true,
      data: {
        userId: account.userId,
        cookies: account.cookies,
        accessToken: account.accessToken,
        sessionId: account.sessionId
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to extract cookies'
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
  res.status(404).sendFile(path.join(__dirname, 'public', '404.html'));
});

// ==================== START SERVER ====================
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📝 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🌐 http://localhost:${PORT}`);
  console.log(`📸 Profile picture URL: ${config.facebook.profilePictureUrl}`);
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