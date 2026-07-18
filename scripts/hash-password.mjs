// Run locally: node scripts/hash-password.mjs "your-password-here"
// Paste the printed hash into .env.local as ADMIN_PASSWORD_HASH.
// The plaintext password never leaves your machine.
import bcrypt from "bcryptjs";

const password = process.argv[2];
if (!password) {
  console.error('Usage: node scripts/hash-password.mjs "your-password"');
  process.exit(1);
}

const hash = bcrypt.hashSync(password, 12);
console.log(hash);
