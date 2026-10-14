require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');
const { MongoClient, ObjectId } = require('mongodb');
const bcrypt = require('bcryptjs');
const { OAuth2Client } = require('google-auth-library');

const app = express();
const PORT = process.env.PORT || 5000;
const MONGODB_URI = process.env.MONGODB_URI;
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const API_SECRET_KEY = process.env.API_SECRET_KEY || 'sec_ai_code_explainer_2026_x789';

const googleClient = new OAuth2Client(GOOGLE_CLIENT_ID);

// Middleware
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-api-secret']
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve frontend static files
app.use(express.static(path.join(__dirname, 'public')));

let db;
let usersCollection;
let explanationsCollection;

// Connect to MongoDB Atlas
async function connectDB() {
    try {
        const client = new MongoClient(MONGODB_URI);
        await client.connect();
        db = client.db('ai_code_explainer');
        usersCollection = db.collection('users');
        explanationsCollection = db.collection('explanations');
        console.log('✅ Connected to MongoDB Atlas (ai_code_explainer)');
    } catch (err) {
        console.error('❌ Failed to connect to MongoDB Atlas:', err.message);
        process.exit(1);
    }
}

// ==========================================
// 0. CONFIG ENDPOINT (for Frontend Google Client ID)
// ==========================================
app.get('/api/config', (req, res) => {
    res.json({
        googleClientId: GOOGLE_CLIENT_ID || ''
    });
});

// ==========================================
// 1. HEALTH CHECK
// ==========================================
app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        service: 'AI Code Explainer API',
        database: db ? 'connected' : 'disconnected',
        time: new Date().toISOString()
    });
});

// ==========================================
// 2. USER REGISTRATION
// ==========================================
app.post('/api/auth/register', async (req, res) => {
    try {
        const name = (req.body.name || '').trim();
        const email = (req.body.email || '').trim().toLowerCase();
        const password = req.body.password || '';

        if (!name || !email || !password) {
            return res.status(400).json({
                success: false,
                message: 'Please fill all fields.'
            });
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.status(400).json({
                success: false,
                message: 'Please enter a valid email address.'
            });
        }

        const existingUser = await usersCollection.findOne({ email });
        if (existingUser) {
            return res.status(409).json({
                success: false,
                message: 'Email already registered.'
            });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const newUser = {
            name,
            email,
            password: hashedPassword,
            auth_provider: 'local',
            created_at: new Date()
        };

        const result = await usersCollection.insertOne(newUser);

        return res.status(201).json({
            success: true,
            message: 'Registration successful!',
            user: {
                id: result.insertedId.toString(),
                name: newUser.name,
                email: newUser.email
            }
        });
    } catch (err) {
        console.error('Register error:', err);
        return res.status(500).json({
            success: false,
            message: 'Server error during registration.'
        });
    }
});

// ==========================================
// 3. USER LOGIN
// ==========================================
app.post('/api/auth/login', async (req, res) => {
    try {
        const email = (req.body.email || '').trim().toLowerCase();
        const password = req.body.password || '';

        if (!email || !password) {
            return res.status(400).json({
                success: false,
                message: 'Please enter email and password.'
            });
        }

        const user = await usersCollection.findOne({ email });
        if (!user) {
            return res.status(401).json({
                success: false,
                message: 'Account not found.'
            });
        }

        if (user.auth_provider === 'google' && !user.password) {
            return res.status(400).json({
                success: false,
                message: 'This account was created with Google. Please use Google Sign In.'
            });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(401).json({
                success: false,
                message: 'Wrong password.'
            });
        }

        return res.json({
            success: true,
            message: 'Login successful!',
            user: {
                id: user._id.toString(),
                mysql_id: user.mysql_id || null,
                name: user.name,
                email: user.email
            }
        });
    } catch (err) {
        console.error('Login error:', err);
        return res.status(500).json({
            success: false,
            message: 'Server error during login.'
        });
    }
});

// ==========================================
// 4. GOOGLE AUTHENTICATION
// ==========================================
app.post('/api/auth/google', async (req, res) => {
    try {
        const { credential, email: directEmail, name: directName } = req.body;

        let googleUser = null;

        if (credential) {
            try {
                const ticket = await googleClient.verifyIdToken({
                    idToken: credential,
                    audience: GOOGLE_CLIENT_ID || undefined
                });
                const payload = ticket.getPayload();
                googleUser = {
                    email: (payload.email || '').toLowerCase(),
                    name: payload.name || payload.given_name || 'Google User',
                    sub: payload.sub,
                    picture: payload.picture
                };
            } catch (tokenErr) {
                const fetch = (await import('node-fetch')).default || globalThis.fetch;
                const tokenInfoRes = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`);
                if (tokenInfoRes.ok) {
                    const payload = await tokenInfoRes.json();
                    googleUser = {
                        email: (payload.email || '').toLowerCase(),
                        name: payload.name || payload.email.split('@')[0],
                        sub: payload.sub,
                        picture: payload.picture
                    };
                } else {
                    return res.status(401).json({
                        success: false,
                        message: 'Invalid Google identity token.'
                    });
                }
            }
        } else if (directEmail) {
            googleUser = {
                email: directEmail.toLowerCase(),
                name: directName || directEmail.split('@')[0],
                sub: 'manual_auth'
            };
        } else {
            return res.status(400).json({
                success: false,
                message: 'No Google credential provided.'
            });
        }

        if (!googleUser || !googleUser.email) {
            return res.status(400).json({
                success: false,
                message: 'Unable to verify Google profile.'
            });
        }

        let user = await usersCollection.findOne({ email: googleUser.email });

        if (user) {
            if (!user.google_id) {
                await usersCollection.updateOne(
                    { _id: user._id },
                    { $set: { google_id: googleUser.sub, updated_at: new Date() } }
                );
            }
        } else {
            const newUser = {
                name: googleUser.name,
                email: googleUser.email,
                password: null,
                auth_provider: 'google',
                google_id: googleUser.sub,
                created_at: new Date()
            };
            const result = await usersCollection.insertOne(newUser);
            user = { ...newUser, _id: result.insertedId };
        }

        return res.json({
            success: true,
            message: 'Google login successful!',
            user: {
                id: user._id.toString(),
                mysql_id: user.mysql_id || null,
                name: user.name,
                email: user.email
            }
        });
    } catch (err) {
        console.error('Google auth error:', err);
        return res.status(500).json({
            success: false,
            message: 'Server error during Google authentication.'
        });
    }
});

// ==========================================
// 5. EXPLANATIONS HISTORY
// ==========================================
app.get('/api/history', async (req, res) => {
    try {
        const userId = req.query.user_id;

        if (!userId) {
            return res.status(400).json({
                success: false,
                message: 'user_id is required.'
            });
        }

        const queryConditions = [];
        if (ObjectId.isValid(userId)) {
            queryConditions.push({ user_id: new ObjectId(userId) });
        }
        const numericId = parseInt(userId, 10);
        if (!isNaN(numericId)) {
            queryConditions.push({ mysql_user_id: numericId });
        }
        queryConditions.push({ user_id: userId });

        const history = await explanationsCollection
            .find({ $or: queryConditions })
            .sort({ created_at: -1 })
            .toArray();

        const formatted = history.map(item => ({
            id: item._id.toString(),
            mysql_id: item.mysql_id || null,
            language: item.language,
            explanation_language: item.explanation_language,
            code: item.code,
            explanation: item.explanation,
            created_at: item.created_at
        }));

        return res.json({
            success: true,
            count: formatted.length,
            explanations: formatted
        });
    } catch (err) {
        console.error('History fetch error:', err);
        return res.status(500).json({
            success: false,
            message: 'Failed to fetch history.'
        });
    }
});

// ==========================================
// 6. SAVE EXPLANATION
// ==========================================
app.post('/api/history/save', async (req, res) => {
    try {
        const { user_id, language, explanation_language, code, explanation } = req.body;

        if (!user_id || !language || !explanation_language || !code || !explanation) {
            return res.status(400).json({
                success: false,
                message: 'Missing required explanation fields.'
            });
        }

        let mongoUserId = user_id;
        let mysqlUserId = null;

        if (ObjectId.isValid(user_id)) {
            mongoUserId = new ObjectId(user_id);
        } else {
            const num = parseInt(user_id, 10);
            if (!isNaN(num)) {
                mysqlUserId = num;
                const u = await usersCollection.findOne({ mysql_id: num });
                if (u) mongoUserId = u._id;
            }
        }

        const doc = {
            user_id: mongoUserId,
            mysql_user_id: mysqlUserId,
            language,
            explanation_language,
            code,
            explanation,
            created_at: new Date()
        };

        const result = await explanationsCollection.insertOne(doc);

        return res.status(201).json({
            success: true,
            id: result.insertedId.toString()
        });
    } catch (err) {
        console.error('History save error:', err);
        return res.status(500).json({
            success: false,
            message: 'Failed to save explanation.'
        });
    }
});

// ==========================================
// 7. DELETE EXPLANATION
// ==========================================
app.delete('/api/history/:id', async (req, res) => {
    try {
        const id = req.params.id;
        const userId = req.body.user_id || req.query.user_id;

        if (!id || !userId) {
            return res.status(400).json({
                success: false,
                message: 'Both id and user_id are required for deletion.'
            });
        }

        const idFilter = [];
        if (ObjectId.isValid(id)) {
            idFilter.push({ _id: new ObjectId(id) });
        }
        const numId = parseInt(id, 10);
        if (!isNaN(numId)) {
            idFilter.push({ mysql_id: numId });
        }

        const userFilter = [];
        if (ObjectId.isValid(userId)) {
            userFilter.push({ user_id: new ObjectId(userId) });
        }
        const numUserId = parseInt(userId, 10);
        if (!isNaN(numUserId)) {
            userFilter.push({ mysql_user_id: numUserId });
        }
        userFilter.push({ user_id: userId });

        const filter = {
            $and: [
                { $or: idFilter },
                { $or: userFilter }
            ]
        };

        const deleteResult = await explanationsCollection.deleteOne(filter);

        if (deleteResult.deletedCount === 0) {
            return res.status(404).json({
                success: false,
                message: 'Explanation not found or unauthorized.'
            });
        }

        return res.json({
            success: true,
            message: 'Explanation deleted successfully.'
        });
    } catch (err) {
        console.error('Delete error:', err);
        return res.status(500).json({
            success: false,
            message: 'Failed to delete explanation.'
        });
    }
});

// ==========================================
// 8. AI CODE EXPLAINER (Gemini API)
// ==========================================
// ==========================================
// 8. MULTI-PROVIDER AI ENGINE (Groq, xAI Grok, Gemini)
// ==========================================

// Candidate models for Google Gemini
const GEMINI_MODELS = [
    'gemini-3.1-flash-lite',
    'gemini-3.5-flash-lite',
    'gemini-3.8-flash',
    'gemini-3-flash-preview',
    'gemini-flash-latest'
];

// Helper: Call Groq Cloud (Ultra-Fast 0.5s LPU inference)
async function callGroq(apiKey, prompt, systemInstruction = '', options = {}) {
    try {
        const fetchFn = (await import('node-fetch')).default || globalThis.fetch;
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 7000);

        const messages = [];
        if (systemInstruction) {
            messages.push({ role: 'system', content: systemInstruction });
        }
        messages.push({ role: 'user', content: prompt });

        const models = [
            'openai/gpt-oss-120b',
            'qwen/qwen3.8-27b',
            'llama-3.3-70b-versatile',
            'llama-3.1-8b-instant'
        ];
        for (const model of models) {
            try {
                console.log(`[AI Provider] Calling Groq Cloud (${model})...`);
                const response = await fetchFn('https://api.groq.com/openai/v1/chat/completions', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${apiKey}`
                    },
                    body: JSON.stringify({
                        model,
                        messages,
                        temperature: options.temperature || 0.2,
                        max_tokens: options.maxOutputTokens || 4096
                    }),
                    signal: controller.signal
                });

                const data = await response.json();
                const text = data.choices?.[0]?.message?.content;
                if (text) {
                    clearTimeout(timer);
                    console.log(`[AI Provider] Groq (${model}) returned response in sub-second!`);
                    return { success: true, text, modelUsed: `Groq (${model})` };
                }
            } catch (err) {
                console.warn(`[AI Provider] Groq (${model}) error:`, err.message);
            }
        }
        clearTimeout(timer);
    } catch (e) {
        console.warn('[AI Provider] Groq call error:', e.message);
    }
    return { success: false, message: 'Groq failed' };
}

// Helper: Call xAI Grok
async function callGrok(apiKey, prompt, systemInstruction = '', options = {}) {
    try {
        const fetchFn = (await import('node-fetch')).default || globalThis.fetch;
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 8000);

        const messages = [];
        if (systemInstruction) {
            messages.push({ role: 'system', content: systemInstruction });
        }
        messages.push({ role: 'user', content: prompt });

        console.log('[AI Provider] Calling xAI Grok (grok-beta)...');
        const response = await fetchFn('https://api.x.ai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: 'grok-beta',
                messages,
                temperature: options.temperature || 0.2
            }),
            signal: controller.signal
        });

        const data = await response.json();
        const text = data.choices?.[0]?.message?.content;
        clearTimeout(timer);
        if (text) {
            console.log('[AI Provider] xAI Grok answered successfully!');
            return { success: true, text, modelUsed: 'xAI Grok' };
        }
        return { success: false, message: data.error?.message || 'Grok error' };
    } catch (e) {
        return { success: false, message: e.message };
    }
}

// Helper: Call Google Gemini with strict 6s timeout per model
async function callGeminiWithFallback(apiKey, prompt, options = {}) {
    let lastError = null;
    const fetchFn = (await import('node-fetch')).default || globalThis.fetch;

    for (const model of GEMINI_MODELS) {
        let timer = null;
        try {
            console.log(`[AI Provider] Calling Gemini (${model})...`);
            const controller = new AbortController();
            // Strict 5.5 second timeout so it never hangs
            timer = setTimeout(() => controller.abort(), 5500);

            const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
            const payload = {
                contents: [{ parts: [{ text: prompt }] }]
            };
            if (options.temperature || options.maxOutputTokens) {
                payload.generationConfig = {
                    temperature: options.temperature || 0.2,
                    maxOutputTokens: options.maxOutputTokens || 8192
                };
            }

            const response = await fetchFn(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
                signal: controller.signal
            });

            clearTimeout(timer);
            const data = await response.json();
            const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

            if (text) {
                console.log(`[AI Provider] Gemini (${model}) succeeded!`);
                return { success: true, text, modelUsed: `Gemini (${model})` };
            }

            const errMsg = data.error?.message || 'Empty response';
            lastError = errMsg;
            console.warn(`[AI Provider] Gemini (${model}) returned: ${errMsg}`);

            if (errMsg.includes('API key') || errMsg.includes('API_KEY_INVALID')) {
                return { success: false, message: 'Invalid Gemini API key.' };
            }
        } catch (err) {
            if (timer) clearTimeout(timer);
            console.warn(`[AI Provider] Gemini (${model}) aborted or failed: ${err.message}`);
            lastError = err.message;
        }
    }

    return {
        success: false,
        message: lastError || 'Gemini models are experiencing heavy traffic.'
    };
}

// Orchestrator: Multi-Provider with automatic failover
async function generateAIResponse(prompt, systemInstruction = '', options = {}) {
    const groqKey = process.env.GROQ_API_KEY;
    const grokKey = process.env.GROK_API_KEY || process.env.XAI_API_KEY;
    const geminiKey = process.env.GEMINI_API_KEY;

    // 1. If Groq is configured, use it first (fastest inference available in ~0.5s)
    if (groqKey) {
        const groqResult = await callGroq(groqKey, prompt, systemInstruction, options);
        if (groqResult.success) return groqResult;
    }

    // 2. If Grok is configured, try Grok
    if (grokKey) {
        const grokResult = await callGrok(grokKey, prompt, systemInstruction, options);
        if (grokResult.success) return grokResult;
    }

    // 3. Try Google Gemini with fast fallback pool
    if (geminiKey) {
        const geminiResult = await callGeminiWithFallback(geminiKey, prompt, options);
        if (geminiResult.success) return geminiResult;
    }

    return {
        success: false,
        message: 'All AI services are currently experiencing high traffic. Please try again in a few moments.'
    };
}

// ==========================================
// 9. AI CODE EXPLAINER
// ==========================================
app.post('/api/ai/explain', async (req, res) => {
    try {
        const { language, explanation_language, code, user_id } = req.body;

        if (!language || !explanation_language || !code) {
            return res.status(400).json({ success: false, message: 'Please provide language, explanation language and code.' });
        }

        const prompt = `
You are an expert programming teacher.

Explain the following code in a simple and beginner-friendly way.

Programming Language: ${language}

Explanation Language: ${explanation_language}

Code:

${code}

Please include:

1. What the code does
2. Line-by-line explanation
3. Important concepts used
4. Expected output

Use Markdown formatting where appropriate.
`;

        const systemInstruction = `You are a world-class code tutor explaining code in ${explanation_language}.`;
        const aiResult = await generateAIResponse(prompt, systemInstruction);

        if (!aiResult.success) {
            return res.status(503).json({ success: false, message: aiResult.message });
        }

        const explanation = aiResult.text;

        // Save to MongoDB Atlas
        if (user_id) {
            let mongoUserId = user_id;
            let mysqlUserId = null;
            if (ObjectId.isValid(user_id)) {
                mongoUserId = new ObjectId(user_id);
            } else {
                const num = parseInt(user_id, 10);
                if (!isNaN(num)) mysqlUserId = num;
            }

            await explanationsCollection.insertOne({
                user_id: mongoUserId,
                mysql_user_id: mysqlUserId,
                language,
                explanation_language,
                code,
                explanation,
                created_at: new Date()
            });
        }

        return res.json({ success: true, explanation, modelUsed: aiResult.modelUsed });
    } catch (err) {
        console.error('AI Explain error:', err);
        return res.status(500).json({ success: false, message: 'AI service connection error.' });
    }
});

// ==========================================
// 10. AI CODE ERROR ANALYZER
// ==========================================
app.post('/api/ai/analyze', async (req, res) => {
    try {
        const { language, explanation_language, code } = req.body;

        if (!language || !explanation_language || !code) {
            return res.status(400).json({ success: false, message: 'Please provide language, explanation language and code.' });
        }

        const prompt = `
You are an expert programming debugger and code reviewer.

Analyze the following ${language} code and find possible errors, bugs, warnings and problems.

IMPORTANT:
1. Check for syntax errors.
2. Check for runtime errors.
3. Check for logical errors.
4. Check for undefined variables or functions.
5. Check for incorrect data types.
6. Check for missing brackets, semicolons or quotes.
7. Check for incorrect function usage.
8. Check for possible infinite loops.
9. Check for security problems if applicable.
10. If there are no errors, clearly say that the code appears correct.
11. Give simple explanations suitable for beginners.
12. Mention approximate line number whenever possible.
13. Provide corrected code snippet for important errors.

Write the answer in this explanation language:
${explanation_language}

Use exactly this structure:
### 🔍 Code Analysis
### 📊 Status
### 🔴 Errors
### 🟡 Warnings & Possible Problems
### 💡 Suggestions
### 📝 Summary

Code:
${code}
`;

        const systemInstruction = `You are an expert debugger and code analyzer outputting in ${explanation_language}.`;
        const aiResult = await generateAIResponse(prompt, systemInstruction, { temperature: 0.2, maxOutputTokens: 8192 });

        if (!aiResult.success) {
            return res.status(503).json({ success: false, message: aiResult.message });
        }

        return res.json({ success: true, analysis: aiResult.text, modelUsed: aiResult.modelUsed });
    } catch (err) {
        console.error('AI Analyze error:', err);
        return res.status(500).json({ success: false, message: 'AI analysis service connection error.' });
    }
});

// Start Server
connectDB().then(() => {
    app.listen(PORT, () => {
        console.log(`🚀 AI Code Explainer Full-Stack App listening on http://localhost:${PORT}`);
    });
});
