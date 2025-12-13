require('dotenv').config();

const { connectDB } = require('../config/db');
const User = require('../models/User');

async function main() {
  const emailArg = process.argv[2];
  const email = (emailArg || '').toLowerCase().trim();

  if (!email) {
    console.error('Usage: node scripts/promote-admin.js <email>');
    process.exit(1);
  }

  await connectDB();

  const user = await User.findOneAndUpdate(
    { email },
    { $set: { role: User.ROLES.ADMIN } },
    { new: true }
  ).lean();

  if (!user) {
    console.error(`User not found: ${email}`);
    process.exit(1);
  }

  console.log(`Promoted to admin: ${user.email} (${user._id.toString()})`);
  process.exit(0);
}

main().catch((err) => {
  console.error('promote-admin failed', err);
  process.exit(1);
});
