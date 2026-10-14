// ============================================================
// ONE-OFF SCRIPT — Promote a user to super_admin
// Run from the backend/ folder:
//   node promote-admin.js +254723562484
//   node promote-admin.js +254723562484 operations
//
// Uses the same MONGODB_URI as the server (from .env).
// Safe to run repeatedly — idempotent.
// ============================================================

require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');

const PHONE = process.argv[2];
const ROLE  = process.argv[3] || 'super_admin';

const VALID_ROLES = ['super_admin', 'operations', 'auditor', 'support', 'compliance'];

async function main() {
    if (!PHONE) {
        console.error('Usage: node promote-admin.js <phoneNumber> [role]');
        console.error('Example: node promote-admin.js +254723562484 super_admin');
        process.exit(1);
    }

    if (!VALID_ROLES.includes(ROLE)) {
        console.error('Invalid role. Choose one of: ' + VALID_ROLES.join(', '));
        process.exit(1);
    }

    if (!process.env.MONGODB_URI) {
        console.error('MONGODB_URI not found. Is .env present in backend/?');
        process.exit(1);
    }

    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB');

        const before = await User.findOne({ phoneNumber: PHONE });
        if (!before) {
            console.error('No user found with phone: ' + PHONE);
            console.error('Check the exact format — should be +254XXXXXXXXX');
            await mongoose.disconnect();
            process.exit(1);
        }

        console.log('Found: ' + before.fullName + ' (' + before.accountNumber + ')');
        console.log('  status: ' + before.status);
        console.log('  role:   ' + (before.role || '(none)'));

        const result = await User.updateOne(
            { phoneNumber: PHONE },
            {
                $set: {
                    role: ROLE,
                    status: 'active'
                }
            }
        );

        console.log('');
        console.log('matched: ' + result.matchedCount + ', modified: ' + result.modifiedCount);
        console.log('✓ ' + before.fullName + ' is now ' + ROLE + ' and active');

        const after = await User.findOne({ phoneNumber: PHONE });
        console.log('');
        console.log('Current state:');
        console.log('  status: ' + after.status);
        console.log('  role:   ' + after.role);

        await mongoose.disconnect();
        process.exit(0);
    } catch (err) {
        console.error('Error:', err.message);
        try { await mongoose.disconnect(); } catch (e) {}
        process.exit(1);
    }
}

main();