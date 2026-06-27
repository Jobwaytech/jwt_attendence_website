import "dotenv/config";
import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import { connectDB } from "../config/db.js";
import User from "../models/User.js";

const password = process.env.PORTAL_ADMIN_PASSWORD || process.argv[2];
const emails = (process.env.ADMIN_EMAILS || "")
  .split(",")
  .map((email) => email.trim().toLowerCase())
  .filter(Boolean);

if (!password || password.length < 6) {
  console.error("Set PORTAL_ADMIN_PASSWORD or pass a password argument with at least 6 characters.");
  process.exit(1);
}

if (!emails.length) {
  console.error("ADMIN_EMAILS is empty. Add at least one admin email to backend/.env.");
  process.exit(1);
}

try {
  const connection = await connectDB();
  if (!connection) {
    console.error("MongoDB is not connected. Check MONGODB_URI in backend/.env.");
    process.exit(1);
  }

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
          role: "super_admin",
          roleLabel: "Super Admin",
          provider: "password",
          branchId: null,
        },
      },
      { returnDocument: "after", upsert: true, runValidators: true, setDefaultsOnInsert: true },
    );

    console.log(`Super Admin ready: ${user.email}`);
  }
} catch (error) {
  console.error(error.message || error);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect().catch(() => {});
}
