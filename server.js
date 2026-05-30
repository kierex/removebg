const express = require('express');
const axios = require('axios');
const path = require('path');
const bodyParser = require('body-parser');
const fs = require('fs').promises;
const crypto = require('crypto');

const app = express();
app.use(express.json());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// Enhanced data structures
const total = new Map();
const activeTimers = new Map();
const rateLimiter = new Map();
const sessionLogs = new Map();

// TikTok video cache
let tiktokVideoCache = null;
let lastTikTokFetch = 0;
const TIKTOK_CACHE_DURATION = 30000; // 30 seconds cache

// Configuration
const CONFIG = {
    RATE_LIMIT_WINDOW: 60000, // 1 minute
    MAX_REQUESTS_PER_WINDOW: 30,
    REQUEST_TIMEOUT: 30000,
    RETRY_ATTEMPTS: 3,
    RETRY_DELAY: 2000,
    LOG_RETENTION_DAYS: 7
};

// Enhanced logging
class Logger {
    static async log(sessionId, action, data) {
        const logEntry = {
            timestamp: new Date().toISOString(),
            sessionId,
            action,
            data
        };

        if (!sessionLogs.has(sessionId)) {
            sessionLogs.set(sessionId, []);
        }
        sessionLogs.get(sessionId).push(logEntry);

        // Keep last 500 logs per session
        if (sessionLogs.get(sessionId).length > 500) {
            sessionLogs.set(sessionId, sessionLogs.get(sessionId).slice(-500));
        }

        // Save to file every 50 logs
        if (sessionLogs.get(sessionId).length % 50 === 0) {
            await this.saveToFile(sessionId);
        }
    }

    static async saveToFile(sessionId) {
        const logs = sessionLogs.get(sessionId);
        if (!logs) return;

        try {
            await fs.mkdir('logs', { recursive: true });
            const filename = `logs/session_${sessionId}_${Date.now()}.json`;
            await fs.writeFile(filename, JSON.stringify(logs.slice(-200), null, 2));
        } catch (error) {
            console.error('Failed to save logs:', error);
        }
    }

    static getLogs(sessionId) {
        return sessionLogs.get(sessionId) || [];
    }
}

// Rate limiter
class RateLimiter {
    static checkLimit(sessionId) {
        const now = Date.now();
        const sessionLimit = rateLimiter.get(sessionId);

        if (!sessionLimit) {
            rateLimiter.set(sessionId, {
                count: 1,
                resetTime: now + CONFIG.RATE_LIMIT_WINDOW
            });
            return true;
        }

        if (now > sessionLimit.resetTime) {
            rateLimiter.set(sessionId, {
                count: 1,
                resetTime: now + CONFIG.RATE_LIMIT_WINDOW
            });
            return true;
        }

        if (sessionLimit.count >= CONFIG.MAX_REQUESTS_PER_WINDOW) {
            return false;
        }

        sessionLimit.count++;
        return true;
    }
}

// TikTok API integration
async function fetchRandomTikTok() {
    try {
        const response = await axios.get('https://betadash-shoti-yazky.vercel.app/shotizxx?apikey=shipazu', {
            timeout: 10000
        });

        if (response.data && response.data.shotiurl) {
            return {
                success: true,
                video: {
                    url: response.data.shotiurl
                }
            };
        }
        throw new Error('Invalid response from TikTok API');
    } catch (error) {
        console.error('TikTok API error:', error.message);
        return {
            success: false,
            error: error.message
        };
    }
}

// ============== API ENDPOINTS ==============

// Get all sessions with stats (for logs page)
app.get('/api/sessions/summary', (req, res) => {
    try {
        const sessions = Array.from(total.values()).map(session => ({
            sessionId: session.sessionId,
            postId: session.postId,
            status: session.status,
            sharedCount: session.count,
            targetAmount: session.target,
            url: session.url,
            startTime: session.startTime
        }));

        let totalShares = 0;
        let activeSessions = 0;
        let completedSessions = 0;

        sessions.forEach(session => {
            totalShares += session.sharedCount || 0;
            if (session.status === 'running') activeSessions++;
            if (session.status === 'completed') completedSessions++;
        });

        res.json({
            success: true,
            sessions,
            totals: {
                totalShares,
                activeSessions,
                completedSessions,
                totalSessions: sessions.length
            }
        });
    } catch (error) {
        console.error('Error fetching sessions summary:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch sessions summary'
        });
    }
});

// Get detailed sessions (for backward compatibility)
app.get('/api/total', (req, res) => {
    try {
        const data = Array.from(total.values()).map(session => ({
            sessionId: session.sessionId,
            url: session.url,
            sharedCount: session.count,
            targetAmount: session.target,
            postId: session.postId,
            status: session.status,
            progress: ((session.count / session.target) * 100).toFixed(2),
            startTime: session.startTime,
            estimatedCompletion: session.estimatedCompletion,
            error: session.error || null
        }));

        res.json({
            success: true,
            activeSessions: total.size,
            sessions: data,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('Error in /api/total:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch session data'
        });
    }
});

// TikTok endpoint - returns only video URL
app.get('/api/tiktok/random', async (req, res) => {
    try {
        const now = Date.now();
        if (tiktokVideoCache && (now - lastTikTokFetch) < TIKTOK_CACHE_DURATION) {
            return res.json(tiktokVideoCache);
        }

        const result = await fetchRandomTikTok();
        if (result.success) {
            tiktokVideoCache = result;
            lastTikTokFetch = now;
            res.json(result);
        } else {
            // Fallback video
            res.json({
                success: true,
                video: {
                    url: "https://v16m.tiktokcdn-us.com/5df5e84d2402e0ba15dfa7680934a925/6a1af973/video/tos/alisg/tos-alisg-pve-0037c001/ogfjIIpt4fwX0siphQCyEjV6APFvDOAeUbDgbE/?a=1233&bti=OUBzOTg7QGo6OjZAL3AjLTAzYCMxNDNg&&bt=1105&ft=kLx3-yt4ZZo0PDFqad3aQ9ATU~j6JE.C~&mime_type=video_mp4&rc=ODM3OGc0ZzM6ODM7ZmllZkBpMzRvcnk5cnZ4djMzODczNEBfYzYwX15eNmExMGEwLzJiYSNwa2ZqMmQ0aGhgLS1kMS1zcw%3D%3D&vvpl=1&l=2026053008512459F084F3864AA74F0D80&btag=e000f0000"
                }
            });
        }
    } catch (error) {
        console.error('Error in /api/tiktok/random:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch TikTok video'
        });
    }
});

// Get session logs
app.get('/api/session/:sessionId/logs', (req, res) => {
    try {
        const { sessionId } = req.params;
        const logs = Logger.getLogs(sessionId);

        const formattedLogs = logs.map(log => ({
            timestamp: log.timestamp,
            action: log.action,
            data: log.data,
            sessionId: log.sessionId
        }));

        res.json({
            success: true,
            sessionId,
            logs: formattedLogs,
            totalLogs: formattedLogs.length
        });
    } catch (error) {
        console.error('Error fetching logs:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch session logs'
        });
    }
});

// Stop session
app.delete('/api/session/:sessionId', async (req, res) => {
    try {
        const { sessionId } = req.params;

        if (!total.has(sessionId)) {
            return res.status(404).json({
                success: false,
                error: 'Session not found'
            });
        }

        await stopSharing(sessionId);
        total.delete(sessionId);

        res.json({
            success: true,
            message: 'Session stopped successfully'
        });
    } catch (error) {
        console.error('Error stopping session:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to stop session'
        });
    }
});

// Submit new share session
app.post('/api/submit', async (req, res) => {
    try {
        const { cookie, url, amount, interval } = req.body;

        if (!cookie || !url || !amount) {
            return res.status(400).json({
                success: false,
                error: 'Missing required fields: cookie, url, amount'
            });
        }

        if (amount < 1 || amount > 10000) {
            return res.status(400).json({
                success: false,
                error: 'Amount must be between 1 and 10000'
            });
        }

        // Force interval to always be 2 seconds
        const forcedInterval = 2;

        if (interval && interval !== 2) {
            console.log(`Interval changed from ${interval} to 2 seconds (forced)`);
        }

        const cookies = await convertCookie(cookie);
        if (!cookies) {
            return res.status(400).json({
                success: false,
                error: 'Invalid cookies format'
            });
        }

        const sessionId = crypto.randomBytes(16).toString('hex');
        const result = await share(cookies, url, amount, forcedInterval, sessionId);

        res.json({
            success: true,
            sessionId: result.sessionId,
            message: 'Sharing started successfully (2 second delay enforced)',
            estimatedCompletion: result.estimatedCompletion
        });
    } catch (err) {
        console.error('Error in /api/submit:', err);
        return res.status(500).json({
            success: false,
            error: err.message || 'Internal server error'
        });
    }
});

// Health check
app.get('/api/health', (req, res) => {
    res.json({
        status: 'healthy',
        activeSessions: total.size,
        maxConcurrent: 'Unlimited',
        uptime: process.uptime(),
        timestamp: new Date().toISOString()
    });
});

// ============== CORE FUNCTIONS ==============

async function share(cookies, url, amount, interval, sessionId) {
    const id = await getPostID(url);
    if (!id) {
        throw new Error("Unable to get post ID: Invalid URL, private post, or friends-only visibility");
    }

    const accessToken = await getAccessToken(cookies);
    if (!accessToken) {
        throw new Error("Unable to get access token: Invalid cookies or session expired");
    }

    const startTime = Date.now();
    const estimatedCompletion = new Date(startTime + (amount * interval * 1000));

    const sessionData = {
        sessionId,
        url,
        postId: id,
        count: 0,
        target: amount,
        status: 'running',
        startTime: new Date().toISOString(),
        estimatedCompletion: estimatedCompletion.toISOString(),
        error: null,
        cookies,
        accessToken,
        interval,
        sharedCount: 0
    };

    total.set(sessionId, sessionData);
    await Logger.log(sessionId, 'session_started', { url, amount, interval, postId: id });

    let sharedCount = 0;
    let consecutiveErrors = 0;

    async function sharePost() {
        if (!total.has(sessionId)) {
            return;
        }

        if (!RateLimiter.checkLimit(sessionId)) {
            await Logger.log(sessionId, 'rate_limited', { timestamp: new Date().toISOString() });
            return;
        }

        try {
            const response = await axios.post(
                `https://graph.facebook.com/me/feed?link=https://m.facebook.com/${id}&published=0&access_token=${accessToken}`,
                {},
                {
                    headers: {
                        'accept': '*/*',
                        'accept-encoding': 'gzip, deflate',
                        'connection': 'keep-alive',
                        'content-length': '0',
                        'cookie': cookies,
                        'host': 'graph.facebook.com',
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                    },
                    timeout: CONFIG.REQUEST_TIMEOUT
                }
            );

            if (response.status === 200) {
                sharedCount++;
                consecutiveErrors = 0;

                const session = total.get(sessionId);
                if (session) {
                    session.count = sharedCount;
                    session.sharedCount = sharedCount;
                    session.status = sharedCount >= amount ? 'completed' : 'running';
                    total.set(sessionId, session);
                }

                await Logger.log(sessionId, 'share_success', {
                    count: sharedCount,
                    total: amount,
                    postId: id,
                    timestamp: new Date().toISOString()
                });

                if (sharedCount >= amount) {
                    await stopSharing(sessionId);
                    await Logger.log(sessionId, 'session_completed', {
                        totalShared: sharedCount,
                        completedAt: new Date().toISOString()
                    });
                }
            }
        } catch (error) {
            consecutiveErrors++;
            await Logger.log(sessionId, 'share_error', {
                error: error.message,
                consecutiveErrors,
                postId: id,
                timestamp: new Date().toISOString()
            });

            if (consecutiveErrors >= 5) {
                await Logger.log(sessionId, 'session_stopped_due_to_errors', {
                    reason: 'Too many consecutive errors',
                    errorCount: consecutiveErrors
                });
                await stopSharing(sessionId);
                if (total.has(sessionId)) {
                    const session = total.get(sessionId);
                    session.status = 'failed';
                    session.error = `Stopped after ${consecutiveErrors} consecutive errors`;
                    total.set(sessionId, session);
                }
            }
        }
    }

    const timer = setInterval(sharePost, interval * 1000);
    activeTimers.set(sessionId, timer);

    const timeoutId = setTimeout(() => {
        if (total.has(sessionId) && total.get(sessionId).count < amount) {
            stopSharing(sessionId);
            const session = total.get(sessionId);
            if (session) {
                session.status = 'timeout';
                session.error = 'Session timed out before completion';
                total.set(sessionId, session);
            }
        }
    }, amount * interval * 1000 + 60000);

    activeTimers.set(`${sessionId}_timeout`, timeoutId);

    return {
        sessionId,
        estimatedCompletion: estimatedCompletion.toISOString()
    };
}

async function stopSharing(sessionId) {
    const timer = activeTimers.get(sessionId);
    if (timer) {
        clearInterval(timer);
        activeTimers.delete(sessionId);
    }

    const timeoutId = activeTimers.get(`${sessionId}_timeout`);
    if (timeoutId) {
        clearTimeout(timeoutId);
        activeTimers.delete(`${sessionId}_timeout`);
    }

    await Logger.log(sessionId, 'session_stopped', {
        timestamp: new Date().toISOString()
    });
}

async function getPostID(url, retryCount = 0) {
    try {
        const response = await axios.post('https://id.traodoisub.com/api.php', 
            `link=${encodeURIComponent(url)}`,
            {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                timeout: CONFIG.REQUEST_TIMEOUT
            }
        );

        if (response.data && response.data.id) {
            return response.data.id;
        }
        throw new Error('No ID returned from API');
    } catch (error) {
        if (retryCount < CONFIG.RETRY_ATTEMPTS) {
            await new Promise(resolve => setTimeout(resolve, CONFIG.RETRY_DELAY));
            return getPostID(url, retryCount + 1);
        }
        return null;
    }
}

async function getAccessToken(cookie, retryCount = 0) {
    try {
        const headers = {
            'authority': 'business.facebook.com',
            'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
            'accept-language': 'en-US,en;q=0.9',
            'cache-control': 'max-age=0',
            'cookie': cookie,
            'referer': 'https://www.facebook.com/',
            'sec-ch-ua': '"Not A(Brand";v="99", "Google Chrome";v="121", "Chromium";v="121"',
            'sec-ch-ua-mobile': '?0',
            'sec-ch-ua-platform': '"Windows"',
            'sec-fetch-dest': 'document',
            'sec-fetch-mode': 'navigate',
            'sec-fetch-site': 'same-origin',
            'upgrade-insecure-requests': '1',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        };

        const response = await axios.get('https://business.facebook.com/content_management', {
            headers,
            timeout: CONFIG.REQUEST_TIMEOUT
        });

        const tokenMatch = response.data.match(/"accessToken":"([^"]+)"/);
        if (tokenMatch && tokenMatch[1]) {
            return tokenMatch[1];
        }

        throw new Error('Access token not found in response');
    } catch (error) {
        if (retryCount < CONFIG.RETRY_ATTEMPTS) {
            await new Promise(resolve => setTimeout(resolve, CONFIG.RETRY_DELAY));
            return getAccessToken(cookie, retryCount + 1);
        }
        return null;
    }
}

async function convertCookie(cookie) {
    try {
        let cookies;
        if (typeof cookie === 'string') {
            try {
                cookies = JSON.parse(cookie);
            } catch {
                if (cookie.includes('=')) {
                    return cookie;
                }
                throw new Error('Invalid cookie format');
            }
        } else if (Array.isArray(cookie)) {
            cookies = cookie;
        } else {
            throw new Error('Cookie must be an array or JSON string');
        }

        const sbCookie = cookies.find(c => c.key === "sb");
        if (!sbCookie) {
            throw new Error("Cookie missing 'sb' field - invalid appstate");
        }

        const sbValue = sbCookie.value;
        const cookieString = `sb=${sbValue}; ${cookies
            .filter(c => c.key !== "sb")
            .map(c => `${c.key}=${c.value}`)
            .join('; ')}`;

        return cookieString;
    } catch (error) {
        console.error('Cookie conversion error:', error);
        throw new Error(error.message || "Error processing cookie");
    }
}

// Cleanup old sessions every hour
setInterval(() => {
    const now = Date.now();
    for (const [sessionId, session] of total.entries()) {
        const sessionTime = new Date(session.startTime).getTime();
        if (session.status === 'completed' && (now - sessionTime) > 86400000) { // 24 hours
            total.delete(sessionId);
            sessionLogs.delete(sessionId);
        }
        if (session.status === 'failed' && (now - sessionTime) > 43200000) { // 12 hours
            total.delete(sessionId);
            sessionLogs.delete(sessionId);
        }
    }
}, 3600000);

// ============== HTML PAGE ROUTES ==============

// Main pages
app.get('/dashboard.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

app.get('/logs.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'logs.html'));
});

app.get('/api-docs.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'api-docs.html'));
});

// Tutorial page
app.get('/tutorial.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'tutorial.html'));
});

// Default route - redirect to dashboard
app.get('/', (req, res) => {
    res.redirect('/dashboard.html');
});

// ============== 404 ERROR HANDLER ==============
// Handle 404 for non-API routes - serve the 404.html page
app.use((req, res, next) => {
    // Skip API routes - they already have their own 404 handler above
    if (req.path.startsWith('/api/')) {
        return next();
    }
    
    // Check if the request accepts HTML
    const acceptHeader = req.headers.accept || '';
    if (acceptHeader.includes('text/html')) {
        // Serve the custom 404 HTML page
        res.status(404);
        res.sendFile(path.join(__dirname, 'public', '404.html'), (err) => {
            if (err) {
                // Fallback if 404.html doesn't exist
                res.status(404).send(`
                    <!DOCTYPE html>
                    <html>
                    <head><title>404 - Page Not Found</title></head>
                    <body style="font-family: Arial; text-align: center; padding: 50px;">
                        <h1>404 - Page Not Found</h1>
                        <p>The page you are looking for does not exist.</p>
                        <a href="/dashboard.html">Return to Dashboard</a>
                    </body>
                    </html>
                `);
            }
        });
    } else {
        res.status(404).json({
            success: false,
            error: 'Endpoint not found',
            path: req.path
        });
    }
});

// ============== 500 ERROR HANDLER ==============
// Global error handler for uncaught errors
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    console.error('Error stack:', err.stack);
    
    // For API routes, return JSON
    if (req.path.startsWith('/api/')) {
        return res.status(500).json({
            success: false,
            error: 'Internal server error',
            message: err.message || 'Something went wrong on the server'
        });
    }
    
    // For HTML routes, serve the custom 500 page
    res.status(500);
    res.sendFile(path.join(__dirname, 'public', '500.html'), (sendErr) => {
        if (sendErr) {
            // Fallback if 500.html doesn't exist
            res.status(500).send(`
                <!DOCTYPE html>
                <html>
                <head><title>500 - Server Error</title></head>
                <body style="font-family: Arial; text-align: center; padding: 50px;">
                    <h1>500 - Internal Server Error</h1>
                    <p>Something went wrong on our end. Please try again later.</p>
                    <a href="/dashboard.html">Return to Dashboard</a>
                </body>
                </html>
            `);
        }
    });
});

// ============== START SERVER ==============
// Create logs directory
(async () => {
    try {
        await fs.mkdir('logs', { recursive: true });
        console.log('📁 Logs directory ready');
    } catch (error) {
        console.error('Failed to create logs directory:', error);
    }
})();

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`
╔══════════════════════════════════════════════════════════════╗
║                    SHAREBOOST PRO SERVER                      ║
╠══════════════════════════════════════════════════════════════╣
║  🚀 Server running on port: ${PORT}                              ║
║  🌐 Dashboard:      http://localhost:${PORT}/dashboard.html     ║
║  📋 Live Logs:      http://localhost:${PORT}/logs.html          ║
║  📖 API Docs:       http://localhost:${PORT}/api-docs.html      ║
║  🎵 TikTok API:     http://localhost:${PORT}/api/tiktok/random  ║
║  ♾️  Unlimited concurrent sessions enabled                      ║
║  ⏱️  Fixed delay: 2 seconds enforced                            ║
║  📊 Health check:   http://localhost:${PORT}/api/health         ║
╠══════════════════════════════════════════════════════════════╣
║  📄 Error Pages:                                               ║
║  🔴 404 Not Found:     http://localhost:${PORT}/404.html        ║
║  🟠 500 Server Error:   http://localhost:${PORT}/500.html        ║
╚══════════════════════════════════════════════════════════════╝
    `);
});

module.exports = app;