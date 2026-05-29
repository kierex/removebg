const express = require('express');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { URLSearchParams } = require('url');
const rateLimit = require('express-rate-limit');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: { error: 'Too many requests, please try again later.' }
});
app.use('/api/', limiter);

// Data directory
const DATA_DIR = path.join(__dirname, 'bot-data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// ──────────────────────────────────────────────────────────────
// Filipino names (from original script)
// ──────────────────────────────────────────────────────────────
const FIRST_NAMES = [
  'Maria','Ana','Joy','Grace','Angel','Angela','Christine','Kristine','Michelle','Shiela',
  'Sheila','Maricel','Marites','Maribel','Marjorie','Jennifer','Jenny','Jessa','Jessica','Janine',
  'Katherine','Catherine','Kathleen','Karen','Karla','Camille','Bianca','Patricia','Patty','Tricia',
  'Aileen','Eileen','Irene','Iris','Hazel','Cherry','Lovely','Honey','Princess','Angelica',
  'Bernadette','Rowena','Rosalie','Roselyn','Rosalinda','Lourdes','Teresa','Therese','Carmela','Carmen',
  'Liza','Elizabeth','Beth','Isabel','Isabela','Bella','Andrea','Andi','Alexandra','Alexa',
  'Nina','Mina','Rina','Jocelyn','Jocelle','Jhoanna','Joan','Joanne','Joanna','Johanna',
  'May','Mae','Mylene','Myra','Myrna','Melanie','Melisa','Melissa','Marissa','Mariz',
  'Pauline','Paula','Paulina','Regina','Rhea','Rochelle','Sharon','Samantha',
  'Sandra','Sarah','Sophia','Sofia','Stephanie','Tiffany','Vanessa','Veronica','Vina','Yvonne',
  'Leah','Lia','Louise','Luisa','Lorraine','Lorna','Lani','Mika','Mikaela',
  'Janelle','Janella','Janice','Joyce','Judy','Judith','Julie','Juliana','Juliet','Julienne',
  'Faith','Hope','Charity','Heaven','Blessy','Precious','Lovelyn','Shaira','Aira','Kyra',
  'Rachelle','Rachel','Reina','Selena','Selina','Trisha','Trina','Wendy','Zenaida',
  'Juan','Jose','Pedro','Paolo','Paul','Mark','John','Johnny','Jonathan','Nathan',
  'Michael','Miguel','Daniel','David','Andrew','Andre','Anthony','Antonio','Albert','Alfred',
  'Brian','Bryan','Benjamin','Carlo','Carlos','Christian','Christopher','Chris','Cedric','Cesar',
  'Dennis','Diego','Dominic','Edward','Edgar','Emmanuel','Eric','Erwin','Francis','Frank',
  'Gabriel','Gilbert','Henry','Ian','Ivan','James','Jasper','Jerome','Joel','Joshua',
  'Kenneth','Kevin','Kyle','Lawrence','Leo','Leonard','Lester','Louis','Lucas','Marco',
  'Martin','Matthew','Melvin','Nathaniel','Noel','Oliver','Patrick','Raymond','Richard',
  'Robert','Ronald','Ryan','Samuel','Sebastian','Steven','Stephen','Thomas','Timothy','Victor',
  'Vincent','Wilfred','William','Xavier','Zachary'
];

const LAST_NAMES = [
  'Santos','Reyes','Cruz','Bautista','Garcia','Mendoza','Flores','Gonzales','Ramos','Aquino',
  'DelaCruz','DelosSantos','Villanueva','Fernandez','Castillo','Torres','Dominguez','Navarro',
  'Salazar','DeGuzman','Perez','Rivera','Lopez','Martinez','Hernandez','Alvarez','Morales',
  'Rojas','Santiago','Padilla','Rosales','Valdez','Estrada','Aguilar','Manalo',
  'Francisco','Romero','Velasco','Soriano','Pascual','Pineda','Ferrer','Cuevas','Suarez','Montes',
  'Calderon','DelosReyes','Lim','Tan','Chua'
];

// ──────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────
function ri(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function rc(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function randChars(chars, n) {
  return Array.from({ length: n }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

// ──────────────────────────────────────────────────────────────
// Password generator
// ──────────────────────────────────────────────────────────────
function getPassword() {
  const az = 'abcdefghijklmnopqrstuvwxyz';
  const AZ = az.toUpperCase();
  const digits = '0123456789';
  const symbols = '!@#$%^&*()_+=';

  const raw = randChars(az, ri(5, 7));
  const namePart = Math.random() > 0.5
    ? raw.charAt(0).toUpperCase() + raw.slice(1)
    : raw.toLowerCase();
  const symbolPart = randChars(symbols, ri(2, 3));
  const digitPart = randChars(digits, ri(2, 4));
  const endPart = randChars(az + AZ, ri(2, 4));
  const optUpper = randChars(AZ, ri(1, 2));

  return shuffle([namePart, symbolPart, digitPart, endPart, optUpper]).join('');
}

// ──────────────────────────────────────────────────────────────
// Email generator
// ──────────────────────────────────────────────────────────────
function getEmail() {
  const name = (rc(FIRST_NAMES) + rc(LAST_NAMES)).toLowerCase().replace(/[^a-z]/g, '');
  return `${name}${ri(1000, 9999)}@xiyadmailx.xyz`;
}

// ──────────────────────────────────────────────────────────────
// Phone generator
// ──────────────────────────────────────────────────────────────
function getPhone() {
  const countries = [
    { code: '+63', prefixes: ['917','918','919','920','921','922'], len: 7 },
    { code: '+62', prefixes: ['813','815','816','817','818','819'], len: 7 },
    { code: '+88', prefixes: ['017','018','019','016','015'], len: 8 },
    { code: '+91', prefixes: ['98','99','97','96','95','94'], len: 8 },
    { code: '+92', prefixes: ['300','301','302','303','304','305'], len: 7 },
    { code: '+234', prefixes: ['701','703','704','705','706','707','802','803'], len: 7 },
    { code: '+1', prefixes: ['201','202','303','312','415','646','718'], len: 7 },
  ];
  const c = rc(countries);
  const digits = Array.from({ length: c.len }, () => ri(0, 9)).join('');
  return `${c.code}${rc(c.prefixes)}${digits}`;
}

// ──────────────────────────────────────────────────────────────
// User-Agent generator
// ──────────────────────────────────────────────────────────────
function getUA() {
  const models = [
    'SM-G975F','SM-A525F','SM-A325F','SM-G996B',
    'CPH2461','CPH2451','CPH2407','CPH2415',
    'Redmi Note 8','Redmi Note 9','2201116SY','2201123G',
    'Infinix X669C','Infinix X676C','Infinix X683','Infinix X6823',
    'RMX3461','RMX3286','RMX3516',
    'Pixel 5','Pixel 6',
  ];
  const blTypes = ['TKQ1','SKQ1','TP1A','RKQ1','SP1A','RP1A'];
  const androidVer = ri(8, 13);
  const chromeVer = ri(90, 114);
  const model = rc(models);
  const bl = `${rc(blTypes)}.${ri(120000, 220000)}.${rc(['001','002','003','011','012'])}`;
  const chrome = `${chromeVer}.0.${ri(4200, 5400)}.${ri(70, 150)}`;
  return `Mozilla/5.0 (Linux; Android ${androidVer}; ${model} Build/${bl}; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/${chrome} Mobile Safari/537.36`;
}

// ──────────────────────────────────────────────────────────────
// HTML hidden-input extractor
// ──────────────────────────────────────────────────────────────
function extractForm(html) {
  const form = {};
  const patterns = [
    /<input[^>]*\sname="([^"]+)"[^>]*\svalue="([^"]*)"[^>]*/gi,
    /<input[^>]*\svalue="([^"]*)"[^>]*\sname="([^"]+)"[^>]*/gi,
  ];
  let m;
  while ((m = patterns[0].exec(html)) !== null) form[m[1]] = m[2];
  while ((m = patterns[1].exec(html)) !== null) if (!(m[2] in form)) form[m[2]] = m[1];
  return form;
}

// ──────────────────────────────────────────────────────────────
// Cookie helpers
// ──────────────────────────────────────────────────────────────
function parseCookieHeaders(headers) {
  const out = {};
  const raw = headers['set-cookie'] || [];
  const list = Array.isArray(raw) ? raw : [raw];
  for (const h of list) {
    if (!h) continue;
    const [pair] = h.split(';');
    const idx = pair.indexOf('=');
    if (idx < 1) continue;
    out[pair.slice(0, idx).trim()] = pair.slice(idx + 1).trim();
  }
  return out;
}

// ──────────────────────────────────────────────────────────────
// Core create function
// ──────────────────────────────────────────────────────────────
async function createOneAccount() {
  const ua = getUA();
  let jar = {};

  // Step 1: GET registration form
  const getResp = await axios.get('https://x.facebook.com/reg', {
    headers: {
      'User-Agent': ua,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
    },
    timeout: 20000,
    maxRedirects: 5,
    validateStatus: () => true,
  });

  Object.assign(jar, parseCookieHeaders(getResp.headers));
  const form = extractForm(getResp.data || '');

  // Generate account info
  const firstname = rc(FIRST_NAMES);
  const lastname = rc(LAST_NAMES);
  const password = getPassword();
  const contact = Math.random() > 0.5 ? getPhone() : getEmail();
  const day = ri(15, 28);
  const month = ri(1, 12);
  const year = ri(1985, 2001);
  const ts = Math.floor(Date.now() / 1000);

  // Step 2: POST to /reg/submit/
  const payload = new URLSearchParams({
    ccp: '2',
    reg_instance: form.reg_instance || '',
    submission_request: 'true',
    reg_impression_id: form.reg_impression_id || '',
    ns: '1',
    logger_id: form.logger_id || '',
    firstname,
    lastname,
    birthday_day: String(day),
    birthday_month: String(month),
    birthday_year: String(year),
    reg_email__: contact,
    sex: '1',
    encpass: `#PWD_BROWSER:0:${ts}:${password}`,
    submit: 'Sign Up',
    fb_dtsg: form.fb_dtsg || '',
    jazoest: form.jazoest || '',
    lsd: form.lsd || '',
  });

  const postHeaders = {
    'User-Agent': ua,
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Content-Type': 'application/x-www-form-urlencoded',
    'Referer': 'https://mbasic.facebook.com/reg/',
    'Cache-Control': 'max-age=0',
    'sec-ch-ua': '',
    'sec-ch-ua-mobile': '?1',
    'sec-ch-ua-platform': 'Android',
    'sec-fetch-dest': 'document',
    'sec-fetch-mode': 'navigate',
    'sec-fetch-site': 'same-origin',
    'sec-fetch-user': '?1',
    'upgrade-insecure-requests': '1',
    'Cookie': Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; '),
  };

  const postResp = await axios.post(
    'https://www.facebook.com/reg/submit/',
    payload.toString(),
    { headers: postHeaders, timeout: 20000, maxRedirects: 5, validateStatus: () => true }
  );

  Object.assign(jar, parseCookieHeaders(postResp.headers));

  const finalUrl = (postResp.request?.res?.responseUrl) || (postResp.request?.path) || '';
  const isCheckpoint = !!jar.checkpoint_session_id || finalUrl.includes('checkpoint') || (typeof postResp.data === 'string' && postResp.data.includes('checkpoint'));

  if (jar.c_user) {
    const uid = jar.c_user;
    const cookieStr = Object.entries(jar).map(([k, v]) => `${k}=${v}`).join(';');
    const line = `${uid}|${password}|${contact}|${firstname} ${lastname}|${cookieStr}`;

    // Save to file
    const outFile = path.join(DATA_DIR, 'created_accounts.txt');
    try {
      fs.appendFileSync(outFile, line + '\n');
    } catch (err) {
      console.error('Error saving account:', err);
    }

    return { 
      status: 'ok', 
      uid, 
      password, 
      name: `${firstname} ${lastname}`, 
      contact, 
      dob: `${day}/${month}/${year}`,
      cookies: jar
    };
  }

  if (isCheckpoint) {
    return { status: 'checkpoint', contact };
  }

  return { status: 'failed', contact };
}

// ──────────────────────────────────────────────────────────────
// API Routes
// ──────────────────────────────────────────────────────────────

// Create single account
app.post('/api/create', async (req, res) => {
  try {
    const result = await createOneAccount();
    res.json({
      success: true,
      data: result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Creation error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Create multiple accounts
app.post('/api/create-multiple', async (req, res) => {
  const { count = 1, delay = 2000 } = req.body;
  const maxCount = Math.min(10, Math.max(1, parseInt(count) || 1));
  
  const results = {
    total: maxCount,
    success: 0,
    checkpoint: 0,
    failed: 0,
    accounts: [],
    errors: []
  };

  for (let i = 0; i < maxCount; i++) {
    try {
      const result = await createOneAccount();
      
      if (result.status === 'ok') {
        results.success++;
        results.accounts.push(result);
      } else if (result.status === 'checkpoint') {
        results.checkpoint++;
        results.errors.push({ index: i + 1, status: 'checkpoint', contact: result.contact });
      } else {
        results.failed++;
        results.errors.push({ index: i + 1, status: 'failed', contact: result.contact });
      }
      
      // Delay between accounts
      if (i < maxCount - 1 && delay > 0) {
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    } catch (error) {
      results.failed++;
      results.errors.push({ index: i + 1, error: error.message });
    }
  }

  res.json({
    success: results.success > 0,
    data: results,
    timestamp: new Date().toISOString()
  });
});

// Get all created accounts
app.get('/api/accounts', (req, res) => {
  const accountsFile = path.join(DATA_DIR, 'created_accounts.txt');
  
  if (!fs.existsSync(accountsFile)) {
    return res.json({
      success: true,
      data: [],
      count: 0,
      timestamp: new Date().toISOString()
    });
  }

  const content = fs.readFileSync(accountsFile, 'utf8');
  const accounts = content.split('\n')
    .filter(line => line.trim())
    .map(line => {
      const [uid, password, contact, name, cookies] = line.split('|');
      return { uid, password, contact, name, cookies: cookies || '' };
    });

  res.json({
    success: true,
    data: accounts,
    count: accounts.length,
    timestamp: new Date().toISOString()
  });
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'running',
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

// Serve index.html for testing
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 API Server running on http://localhost:${PORT}`);
  console.log(`📁 Data directory: ${DATA_DIR}`);
  console.log(`📡 Endpoints:`);
  console.log(`   GET  /api/health - Health check`);
  console.log(`   POST /api/create - Create single account`);
  console.log(`   POST /api/create-multiple - Create multiple accounts`);
  console.log(`   GET  /api/accounts - List all accounts`);
  console.log(`   GET  / - Web interface`);
});