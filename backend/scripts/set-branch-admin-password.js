import "dotenv/config";
import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import { connectDB } from "../config/db.js";
import Branch from "../models/Branch.js";
import User from "../models/User.js";

const password = process.env.PORTAL_BRANCH_ADMIN_PASSWORD || process.argv[2];
const emails = (process.env.BRANCH_ADMIN_EMAILS || process.env.BRANCH_ADMIN_OTP_RECIPIENTS || "")
  .split(",")
  .map((email) => email.trim().toLowerCase())
  .filter(Boolean);

if (!password || password.length < 6) {
  console.error("Set PORTAL_BRANCH_ADMIN_PASSWORD or pass a password argument with at least 6 characters.");
  process.exit(1);
}

if (!emails.length) {
  console.error("BRANCH_ADMIN_EMAILS or BRANCH_ADMIN_OTP_RECIPIENTS is empty.");
  process.exit(1);
}

try {
  const connection = await connectDB();
  if (!connection) {
    console.error("MongoDB is not connected. Check MONGODB_URI in backend/.env.");
    process.exit(1);
  }

  const branch = await Branch.findOneAndUpdate(
    { code: "MPL" },
    {
      $setOnInsert: {
        name: "MPL Branch",
        code: "MPL",
        address: "Madanapalle",
        manager: "Branch Admin",
        contactEmail: emails[0],
      },
    },
    { returnDocument: "after", upsert: true, runValidators: true, setDefaultsOnInsert: true },
  );
  const passwordHash = await bcrypt.hash(password, 10);

  for (const email of emails) {
    const name = email
      .split("@")[0]
      .replace(/[._-]+/g, " ")
      .replace(/\b\w/g, (char) => char.toUpperCase());

    const user = await User.findOneAndUpdate(
      { email },
      {
        $set: {
          name,
          email,
          passwordHash,
          role: "branch_admin",
          roleLabel: "Branch Admin",
          provider: "password",
          branchId: branch._id,
        },
      },
      { returnDocument: "after", upsert: true, runValidators: true, setDefaultsOnInsert: true },
    );

    console.log(`Branch Admin ready: ${user.email} (${branch.code})`);
  }
} catch (error) {
  console.error(error.message || error);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect().catch(() => {});
}
