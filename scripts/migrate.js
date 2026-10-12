require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { MongoClient } = require('mongodb');

const sqlFilePath = path.resolve(__dirname, '../../if0_42728727_ai_code_explainer.sql');
const uri = process.env.MONGODB_URI;

if (!uri) {
    console.error('❌ MONGODB_URI is not set in .env');
    process.exit(1);
}

if (!fs.existsSync(sqlFilePath)) {
    console.error(`❌ SQL file not found at: ${sqlFilePath}`);
    process.exit(1);
}

// Full token parser that respects string literals, escaped quotes, and newlines
function extractAllRows(sqlText, tableName) {
    const prefix = 'INSERT INTO `' + tableName + '`';
    let pos = 0;
    const allTuples = [];

    while ((pos = sqlText.indexOf(prefix, pos)) !== -1) {
        const valuesIdx = sqlText.indexOf('VALUES', pos);
        if (valuesIdx === -1) break;
        let i = valuesIdx + 6;

        let inString = false;
        let escape = false;
        let inTuple = false;
        let currentTuple = [];
        let currentVal = '';

        while (i < sqlText.length) {
            const ch = sqlText[i];

            if (inString) {
                if (escape) {
                    currentVal += ch;
                    escape = false;
                } else if (ch === '\\') {
                    escape = true;
                } else if (ch === "'") {
                    inString = false;
                } else {
                    currentVal += ch;
                }
            } else {
                if (ch === "'") {
                    inString = true;
                } else if (ch === '(' && !inTuple) {
                    inTuple = true;
                    currentTuple = [];
                    currentVal = '';
                } else if (ch === ')' && inTuple) {
                    inTuple = false;
                    currentTuple.push(currentVal.trim());
                    allTuples.push(currentTuple);
                    currentVal = '';
                } else if (ch === ',' && inTuple) {
                    currentTuple.push(currentVal.trim());
                    currentVal = '';
                } else if (ch === ';') {
                    pos = i + 1;
                    break;
                } else if (inTuple) {
                    currentVal += ch;
                }
            }
            i++;
        }
    }
    return allTuples;
}

async function runMigration() {
    console.log('📖 Reading SQL dump file...');
    const sqlContent = fs.readFileSync(sqlFilePath, 'utf8');

    // 1. Parse Users
    const rawUserTuples = extractAllRows(sqlContent, 'users');
    const usersToInsert = rawUserTuples.map(t => {
        const id = parseInt(t[0], 10);
        const name = t[1];
        const email = t[2].toLowerCase();
        const password = t[3];
        const createdAt = t[4] ? new Date(t[4]) : new Date();

        return {
            mysql_id: id,
            name: name,
            email: email,
            password: password,
            auth_provider: 'local',
            created_at: createdAt
        };
    });
    console.log(`👤 Found ${usersToInsert.length} users to migrate.`);

    // 2. Parse Explanations
    const rawExpTuples = extractAllRows(sqlContent, 'explanations');
    console.log(`📝 Found ${rawExpTuples.length} explanations to migrate.`);

    // Connect to MongoDB Atlas
    const client = new MongoClient(uri);
    await client.connect();
    console.log('✅ Connected to MongoDB Atlas');

    const db = client.db('ai_code_explainer');
    const usersCollection = db.collection('users');
    const explanationsCollection = db.collection('explanations');

    // Clean existing collections for a pristine fresh import
    await usersCollection.deleteMany({});
    await explanationsCollection.deleteMany({});

    // Ensure Indexes
    await usersCollection.createIndex({ email: 1 }, { unique: true });
    await usersCollection.createIndex({ mysql_id: 1 });
    await explanationsCollection.createIndex({ user_id: 1 });
    await explanationsCollection.createIndex({ mysql_id: 1 });
    await explanationsCollection.createIndex({ created_at: -1 });

    // Migrate Users
    const mysqlIdToMongoId = new Map();
    for (const u of usersToInsert) {
        const res = await usersCollection.findOneAndUpdate(
            { email: u.email },
            { $setOnInsert: u },
            { upsert: true, returnDocument: 'after' }
        );
        mysqlIdToMongoId.set(u.mysql_id, res._id);
    }
    console.log(`✅ Users collection verified: ${mysqlIdToMongoId.size} users mapped.`);

    // Migrate Explanations
    let expInserted = 0;
    for (const t of rawExpTuples) {
        const id = parseInt(t[0], 10);
        const mysqlUserId = parseInt(t[1], 10);
        const language = t[2];
        const explanationLanguage = t[3];
        const code = t[4];
        const explanation = t[5];
        const createdAt = t[6] ? new Date(t[6]) : new Date();

        const mongoUserId = mysqlIdToMongoId.get(mysqlUserId);

        const expDoc = {
            mysql_id: id,
            user_id: mongoUserId,
            mysql_user_id: mysqlUserId,
            language: language,
            explanation_language: explanationLanguage,
            code: code,
            explanation: explanation,
            created_at: createdAt
        };

        await explanationsCollection.updateOne(
            { mysql_id: id },
            { $setOnInsert: expDoc },
            { upsert: true }
        );
        expInserted++;
    }
    console.log(`✅ Explanations processed: ${expInserted}`);

    // Verification
    const totalUsers = await usersCollection.countDocuments();
    const totalExplanations = await explanationsCollection.countDocuments();

    console.log('\n📊 === MIGRATION VERIFICATION ===');
    console.log(`Total users in MongoDB Atlas: ${totalUsers} (Expected: ${usersToInsert.length})`);
    console.log(`Total explanations in MongoDB Atlas: ${totalExplanations} (Expected: ${rawExpTuples.length})`);
    console.log('=================================\n');

    await client.close();
}

runMigration().catch(err => {
    console.error('❌ Migration failed:', err);
    process.exit(1);
});
