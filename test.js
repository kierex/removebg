const axios = require('axios');
const fs = require('fs');

const API_URL = 'http://localhost:3000';
const CRED_FILE = 'master_credentials.txt';

async function testAPI() {
  console.log('🧪 Testing Facebook Account Creator API\n');
  
  // Read credentials
  let apiKey, apiSecret;
  try {
    const content = fs.readFileSync(CRED_FILE, 'utf8');
    const keyMatch = content.match(/API Key: (fb_[a-f0-9]+)/);
    const secretMatch = content.match(/API Secret: (sec_[a-f0-9]+)/);
    apiKey = keyMatch ? keyMatch[1] : null;
    apiSecret = secretMatch ? secretMatch[1] : null;
  } catch (error) {
    console.log('⚠️  No master credentials found. Please run setup first: npm run setup');
    return;
  }
  
  if (!apiKey || !apiSecret) {
    console.log('❌ Invalid credentials in master_credentials.txt');
    return;
  }
  
  const headers = {
    'X-API-Key': apiKey,
    'X-API-Secret': apiSecret,
    'Content-Type': 'application/json'
  };
  
  // Test 1: Health Check
  console.log('1️⃣ Testing Health Check...');
  try {
    const health = await axios.get(`${API_URL}/api/health`);
    console.log(`   ✅ Health Check: ${health.data.status}\n`);
  } catch (error) {
    console.log(`   ❌ Health Check Failed: ${error.message}\n`);
    return;
  }
  
  // Test 2: Dashboard Stats
  console.log('2️⃣ Fetching Dashboard Stats...');
  try {
    const stats = await axios.get(`${API_URL}/api/dashboard/stats`, { headers });
    console.log(`   ✅ Stats: ${stats.data.data.totalAccounts} total accounts\n`);
  } catch (error) {
    console.log(`   ❌ Stats Failed: ${error.response?.data?.error || error.message}\n`);
  }
  
  // Test 3: Generate Temp Email
  console.log('3️⃣ Generating Temporary Email...');
  try {
    const email = await axios.get(`${API_URL}/api/tempmail/gen`, { headers });
    console.log(`   ✅ Email Generated: ${email.data.data.email}\n`);
  } catch (error) {
    console.log(`   ❌ Email Generation Failed: ${error.response?.data?.error || error.message}\n`);
  }
  
  // Test 4: Create Account with Auto Email
  console.log('4️⃣ Creating Account (with auto-generated email)...');
  try {
    const account = await axios.post(`${API_URL}/api/fbcreate`, 
      { autoGenerateEmail: true },
      { headers }
    );
    console.log(`   ✅ Account Created: ${account.data.data.firstName} ${account.data.data.lastName}`);
    console.log(`   📧 Email: ${account.data.data.email}`);
    console.log(`   🔑 Password: ${account.data.data.password}\n`);
  } catch (error) {
    console.log(`   ❌ Account Creation Failed: ${error.response?.data?.error || error.message}\n`);
  }
  
  // Test 5: List Accounts
  console.log('5️⃣ Listing Accounts...');
  try {
    const accounts = await axios.get(`${API_URL}/api/accounts`, { headers });
    console.log(`   ✅ Found ${accounts.data.count} accounts\n`);
  } catch (error) {
    console.log(`   ❌ List Accounts Failed: ${error.response?.data?.error || error.message}\n`);
  }
  
  console.log('========================================');
  console.log('✅ API Testing Complete!');
  console.log('========================================');
}

testAPI().catch(console.error);