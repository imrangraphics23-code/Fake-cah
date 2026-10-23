const express = require('express');
const path = require('path');
const cors = require('cors');
const fs = require('fs');
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(cors());

app.use(express.static(path.join(__dirname, 'public')));

const PORT = process.env.PORT || 3000;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";
const DB_FILE = path.join(__dirname, 'database.json');

// Database Initializer (JSON Database)
if (!fs.existsSync(DB_FILE)) {
    const initialDb = {
        licenses: {
            "CR-DEMO-2026": { active: true, clientName: "Demo Client", usageCount: 0, maxUsage: 100 }
        },
        logs: []
    };
    fs.writeFileSync(DB_FILE, JSON.stringify(initialDb, null, 2));
}

function getDb() { return JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); }
function saveDb(data) { fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2)); }

// License Verification Middleware
const verifyLicense = (req, res, next) => {
    const userKey = req.headers['x-license-key'];
    const db = getDb();

    if (!userKey || !db.licenses[userKey]) {
        return res.status(401).json({ error: "Invalid License Key! Contact Admin for access." });
    }

    const license = db.licenses[userKey];
    if (!license.active) {
        return res.status(403).json({ error: "License key suspended or expired!" });
    }

    if (license.usageCount >= license.maxUsage) {
        return res.status(403).json({ error: "Usage limit exceeded for this License Key!" });
    }

    // Update Usage & Add Track Log
    license.usageCount += 1;
    db.logs.push({
        ip: req.ip || req.connection.remoteAddress,
        licenseKey: userKey,
        clientName: license.clientName,
        action: req.path,
        timestamp: new Date().toISOString()
    });

    saveDb(db);
    next();
};

// ================= API ENDPOINTS ================= //

// 1. Generate Topics
app.post('/api/generate-topics', verifyLicense, async (req, res) => {
    try {
        const { niche, angle, notes } = req.body;
        
        const systemPrompt = `You are a Social Media Content Strategist for a Logo & Branding Agency targeting Real Estate Brokers.
Target Client: ${niche}
Campaign Angle: ${angle}
Context: ${notes}

Generate 3 unique, high-performing content topics/pillars that attract real estate brokers looking to rebrand.

Respond strictly in JSON format with key "topics":
{
  "topics": [
    {"id": 1, "title": "Topic title 1", "desc": "Brief 1-sentence reason why this converts brokers"},
    {"id": 2, "title": "Topic title 2", "desc": "Brief 1-sentence reason why this converts brokers"},
    {"id": 3, "title": "Topic title 3", "desc": "Brief 1-sentence reason why this converts brokers"}
  ]
}`;

        const fetch = (await import('node-fetch')).default;
        const apiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                contents: [{ parts: [{ text: systemPrompt }] }],
                generationConfig: { responseMimeType: "application/json" }
            })
        });

        const data = await apiRes.json();
        if (data.error) throw new Error(data.error.message);

        const result = JSON.parse(data.candidates[0].content.parts[0].text);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 2. Generate Omni Content
app.post('/api/generate-omni', verifyLicense, async (req, res) => {
    try {
        const { topic, niche } = req.body;

        const systemPrompt = `You are an Omni-Channel Social Media Copywriter for a Real Estate Logo & Branding Agency.
Topic: "${topic}"
Target Client: ${niche}

Write platform-customized posts respecting algorithm limits:
1. Instagram: Carousel/Reel Script + Caption + hashtags.
2. LinkedIn: Long-form B2B story + hashtags.
3. Twitter: MAX 280 characters.
4. Facebook: Conversational + CTA.
5. Inbound DM Script: Closing script for comments.

Respond strictly in JSON format:
{
  "instagram": "Instagram content...",
  "linkedin": "LinkedIn post...",
  "twitter": "Tweet content...",
  "facebook": "Facebook post...",
  "dm_script": "DM Closing script..."
}`;

        const fetch = (await import('node-fetch')).default;
        const apiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                contents: [{ parts: [{ text: systemPrompt }] }],
                generationConfig: { responseMimeType: "application/json" }
            })
        });

        const data = await apiRes.json();
        if (data.error) throw new Error(data.error.message);

        const result = JSON.parse(data.candidates[0].content.parts[0].text);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ================= ADMIN DASHBOARD API ================= //

// Admin Tracking Stats Fetch
app.get('/api/admin/stats', (req, res) => {
    const pass = req.headers['x-admin-pass'];
    if (pass !== process.env.ADMIN_PASSWORD) {
        return res.status(401).json({ error: "Unauthorized Admin" });
    }
    res.json(getDb());
});

// Generate New License Key
app.post('/api/admin/create-key', (req, res) => {
    const pass = req.headers['x-admin-pass'];
    if (pass !== process.env.ADMIN_PASSWORD) {
        return res.status(401).json({ error: "Unauthorized Admin" });
    }

    const { clientName, maxUsage } = req.body;
    const newKey = "CR-" + Math.random().toString(36).substring(2, 6).toUpperCase() + "-" + Math.random().toString(36).substring(2, 6).toUpperCase();

    const db = getDb();
    db.licenses[newKey] = {
        active: true,
        clientName: clientName || "Client",
        usageCount: 0,
        maxUsage: parseInt(maxUsage) || 500
    };

    saveDb(db);
    res.json({ success: true, key: newKey });
});

// Toggle License Status (Active/Suspend)
app.post('/api/admin/toggle-key', (req, res) => {
    const pass = req.headers['x-admin-pass'];
    if (pass !== process.env.ADMIN_PASSWORD) {
        return res.status(401).json({ error: "Unauthorized Admin" });
    }

    const { key } = req.body;
    const db = getDb();
    if (db.licenses[key]) {
        db.licenses[key].active = !db.licenses[key].active;
        saveDb(db);
        res.json({ success: true, active: db.licenses[key].active });
    } else {
        res.status(404).json({ error: "Key not found" });
    }
});

app.listen(PORT, () => console.log(`Server running with License System on http://localhost:${PORT}`));