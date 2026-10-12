require('dotenv').config();
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
// 2. USER REGISTRATION (Goal #3)
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

        // Email regex check
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.status(400).json({
                success: false,
                message: 'Please enter a valid email address.'
            });
        }

        // Check if user already exists
        const existingUser = await usersCollection.findOne({ email });
        if (existingUser) {
            return res.status(409).json({
                success: false,
                message: 'Email already registered.'
            });
        }

        // Hash password securely (bcrypt)
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
// 3. USER LOGIN (Goal #3)
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

        // If user registered with Google and has no password
        if (user.auth_provider === 'google' && !user.password) {
            return res.status(400).json({
                success: false,
                message: 'This account was created with Google. Please use Google Sign In.'
            });
        }

        // Compare bcrypt password
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
// 4. GOOGLE AUTHENTICATION (Goal #2)
// ==========================================
app.post('/api/auth/google', async (req, res) => {
    try {
        const { credential, email: directEmail, name: directName } = req.body;

        let googleUser = null;

        // 1. Verify Google ID Token (Official OAuth 2.0 / OpenID Connect)
        if (credential) {
            try {
                // First try official verifyIdToken
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
                // Fallback to Google tokeninfo API endpoint
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
            // Direct email / name fallback for local testing
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

        // 2. Check if user already exists
        let user = await usersCollection.findOne({ email: googleUser.email });

        if (user) {
            // Account linking: link google_id if not present
            if (!user.google_id) {
                await usersCollection.updateOne(
                    { _id: user._id },
                    { $set: { google_id: googleUser.sub, updated_at: new Date() } }
                );
            }
        } else {
            // Create new user account via Google
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
// 5. EXPLANATIONS HISTORY (Goal #3)
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

        // Query by ObjectId or mysql_user_id or string
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
// 6. SAVE EXPLANATION (Goal #3)
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
                // Find matching user document
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
// 7. DELETE EXPLANATION (Goal #3)
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

// Start Server
connectDB().then(() => {
    app.listen(PORT, () => {
        console.log(`🚀 AI Code Explainer API listening on http://localhost:${PORT}`);
    });
});

