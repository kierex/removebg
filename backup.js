const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DB_PATH = './accounts.db';
const BACKUP_DIR = './backups';

// Create backup directory if it doesn't exist
if (!fs.existsSync(BACKUP_DIR)) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

// Generate backup filename with timestamp
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupFile = path.join(BACKUP_DIR, `accounts_backup_${timestamp}.db`);

// Copy database file
if (fs.existsSync(DB_PATH)) {
  fs.copyFileSync(DB_PATH, backupFile);
  console.log(`✅ Database backed up to: ${backupFile}`);
  
  // Compress backup
  const crypto = require('zlib');
  const gzip = require('zlib').createGzip();
  const readStream = fs.createReadStream(backupFile);
  const writeStream = fs.createWriteStream(`${backupFile}.gz`);
  
  readStream.pipe(gzip).pipe(writeStream);
  writeStream.on('finish', () => {
    console.log(`✅ Compressed backup: ${backupFile}.gz`);
    // Remove original backup after compression
    fs.unlinkSync(backupFile);
  });
} else {
  console.log('⚠️  Database file not found');
}

// Keep only last 10 backups
const backups = fs.readdirSync(BACKUP_DIR)
  .filter(f => f.endsWith('.gz'))
  .sort()
  .reverse();

if (backups.length > 10) {
  backups.slice(10).forEach(backup => {
    fs.unlinkSync(path.join(BACKUP_DIR, backup));
    console.log(`🗑️  Removed old backup: ${backup}`);
  });
}