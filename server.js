import bcrypt from "bcryptjs";
import cors from "cors";
import "dotenv/config";
import express from "express";
import { OAuth2Client } from "google-auth-library";
import jwt from "jsonwebtoken";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { generateSecret, generateURI, verifySync } from "otplib";
import QRCode from "qrcode";

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || "change-this-secret-before-production";
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "";
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || "admin@example.com")
  .split(",")
  .map((email) => email.trim().toLowerCase())
  .filter(Boolean);
const DATA_DIR = join(__dirname, "data");
const USERS_FILE = join(DATA_DIR, "users.json");
const googleClient = new OAuth2Client(GOOGLE_CLIENT_ID);

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

function ensureDatabase() {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });

  if (!existsSync(USERS_FILE)) {
    const adminPassword = bcrypt.hashSync("123456", 10);
    writeFileSync(
      USERS_FILE,
      JSON.stringify(
        [
          {
            id: randomUUID(),
            name: "Admin User",
            email: "admin@example.com",
            passwordHash: adminPassword,
            role: "admin",
            provider: "password",
            twoFactorEnabled: false,
            twoFactorSecret: null,
            createdAt: new Date().toISOString(),
          },
        ],
        null,
        2,
      ),
    );
  }
}

function readUsers() {
  ensureDatabase();
  return JSON.parse(readFileSync(USERS_FILE, "utf8"));
}

function writeUsers(users) {
  writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

function publicUser(user) {
  const { passwordHash, twoFactorSecret, pendingTwoFactorSecret, ...safeUser } = user;
  return safeUser;
}

function createToken(user) {
  return jwt.sign({ id: user.id, role: user.role }, JWT_SECRET, { expiresIn: "2h" });
}

function createTwoFactorToken(user) {
  return jwt.sign({ id: user.id, purpose: "2fa" }, JWT_SECRET, { expiresIn: "5m" });
}

function verifyTwoFactorToken(token) {
  const payload = jwt.verify(token, JWT_SECRET);
  if (payload.purpose !== "2fa") throw new Error("Invalid 2FA token.");
  return payload;
}

function authResponseFor(user) {
  if (user.twoFactorEnabled) {
    return {
      requires2fa: true,
      twoFactorToken: createTwoFactorToken(user),
      message: "Enter your authenticator code to finish login.",
    };
  }

  return {
    requires2fa: false,
    token: createToken(user),
    user: publicUser(user),
    needs2faSetup: !user.twoFactorEnabled,
  };
}

function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ message: "Authentication token is required." });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const user = readUsers().find((item) => item.id === payload.id);
    if (!user) return res.status(401).json({ message: "User session is no longer valid." });
    req.user = user;
    next();
  } catch {
    res.status(401).json({ message: "Invalid or expired session." });
  }
}

function requireAdmin(req, res, next) {
  if (req.user.role !== "admin") {
    return res.status(403).json({ message: "Admin access is required." });
  }
  next();
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "AuthFlow API" });
});

app.get("/api/config", (_req, res) => {
  res.json({ googleClientId: GOOGLE_CLIENT_ID });
});

app.post("/api/register", async (req, res) => {
  const name = String(req.body.name || "").trim();
  const email = String(req.body.email || "").trim().toLowerCase();
  const password = String(req.body.password || "");
  const role = req.body.role === "user" ? "user" : "admin";

  if (!name) return res.status(400).json({ message: "Full name is required." });
  if (!validateEmail(email)) return res.status(400).json({ message: "Enter a valid email address." });
  if (password.length < 6) return res.status(400).json({ message: "Password must be at least 6 characters." });

  const users = readUsers();
  if (users.some((user) => user.email === email)) {
    return res.status(409).json({ message: "This email is already registered." });
  }

  const newUser = {
    id: randomUUID(),
    name,
    email,
    passwordHash: await bcrypt.hash(password, 10),
    role,
    provider: "password",
    twoFactorEnabled: false,
    twoFactorSecret: null,
    createdAt: new Date().toISOString(),
  };

  users.push(newUser);
  writeUsers(users);
  res.status(201).json({ user: publicUser(newUser) });
});

app.post("/api/login", async (req, res) => {
  const email = String(req.body.email || "").trim().toLowerCase();
  const password = String(req.body.password || "");
  const users = readUsers();
  const user = users.find((item) => item.email === email);

  if (!user?.passwordHash || !(await bcrypt.compare(password, user.passwordHash))) {
    return res.status(401).json({ message: "Invalid email or password." });
  }

  if (user.role !== "admin") {
    return res.status(403).json({ message: "Only admin users can access the dashboard." });
  }

  res.json(authResponseFor(user));
});

app.post("/api/google-login", async (req, res) => {
  if (!GOOGLE_CLIENT_ID) {
    return res.status(500).json({ message: "Google login is not configured. Add GOOGLE_CLIENT_ID to your environment." });
  }

  const credential = String(req.body.credential || "");
  if (!credential) return res.status(400).json({ message: "Google credential is required." });

  try {
    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    const email = String(payload.email || "").toLowerCase();

    if (!payload.email_verified) {
      return res.status(403).json({ message: "Your Google email must be verified." });
    }

    const users = readUsers();
    let user = users.find((item) => item.email === email);

    if (!user) {
      user = {
        id: randomUUID(),
        name: payload.name || email,
        email,
        passwordHash: null,
        role: ADMIN_EMAILS.includes(email) ? "admin" : "user",
        provider: "google",
        googleSub: payload.sub,
        picture: payload.picture,
        twoFactorEnabled: false,
        twoFactorSecret: null,
        createdAt: new Date().toISOString(),
      };
      users.push(user);
      writeUsers(users);
    } else {
      user.provider = user.provider || "google";
      user.googleSub = payload.sub;
      user.picture = payload.picture;
      writeUsers(users);
    }

    if (user.role !== "admin") {
      return res.status(403).json({ message: "Your Gmail account is valid, but only admin accounts can access the dashboard." });
    }

    res.json(authResponseFor(user));
  } catch {
    res.status(401).json({ message: "Google sign-in verification failed." });
  }
});

app.post("/api/2fa/verify-login", (req, res) => {
  const twoFactorToken = String(req.body.twoFactorToken || "");
  const code = String(req.body.code || "").replace(/\s/g, "");

  try {
    const payload = verifyTwoFactorToken(twoFactorToken);
    const user = readUsers().find((item) => item.id === payload.id);
    if (!user || !user.twoFactorEnabled || !user.twoFactorSecret) {
      return res.status(401).json({ message: "2FA verification is not available for this user." });
    }

    const valid = verifySync({ token: code, secret: user.twoFactorSecret });
    if (!valid) return res.status(401).json({ message: "Invalid authenticator code." });

    res.json({ token: createToken(user), user: publicUser(user), requires2fa: false });
  } catch {
    res.status(401).json({ message: "Invalid or expired 2FA login session." });
  }
});

app.get("/api/me", requireAuth, (req, res) => {
  res.json({ user: publicUser(req.user) });
});

app.get("/api/users", requireAuth, requireAdmin, (_req, res) => {
  res.json({ users: readUsers().map(publicUser) });
});

app.post("/api/2fa/setup", requireAuth, async (req, res) => {
  const users = readUsers();
  const user = users.find((item) => item.id === req.user.id);
  const secret = generateSecret();
  const otpauth = generateURI({ issuer: "AuthFlow", label: user.email, secret });
  const qrCodeDataUrl = await QRCode.toDataURL(otpauth);

  user.pendingTwoFactorSecret = secret;
  writeUsers(users);

  res.json({ secret, qrCodeDataUrl });
});

app.post("/api/2fa/enable", requireAuth, (req, res) => {
  const code = String(req.body.code || "").replace(/\s/g, "");
  const users = readUsers();
  const user = users.find((item) => item.id === req.user.id);

  if (!user?.pendingTwoFactorSecret) {
    return res.status(400).json({ message: "Start 2FA setup first." });
  }

  const valid = verifySync({ token: code, secret: user.pendingTwoFactorSecret });
  if (!valid) return res.status(401).json({ message: "Invalid authenticator code." });

  user.twoFactorSecret = user.pendingTwoFactorSecret;
  user.twoFactorEnabled = true;
  delete user.pendingTwoFactorSecret;
  writeUsers(users);

  res.json({ user: publicUser(user) });
});

app.post("/api/2fa/disable", requireAuth, (req, res) => {
  const code = String(req.body.code || "").replace(/\s/g, "");
  const users = readUsers();
  const user = users.find((item) => item.id === req.user.id);

  if (!user?.twoFactorEnabled || !user.twoFactorSecret) {
    return res.status(400).json({ message: "2FA is not enabled." });
  }

  const valid = verifySync({ token: code, secret: user.twoFactorSecret });
  if (!valid) return res.status(401).json({ message: "Invalid authenticator code." });

  user.twoFactorSecret = null;
  user.twoFactorEnabled = false;
  writeUsers(users);

  res.json({ user: publicUser(user) });
});

app.delete("/api/users/:id", requireAuth, requireAdmin, (req, res) => {
  if (req.params.id === req.user.id) {
    return res.status(400).json({ message: "You cannot delete the currently logged-in admin." });
  }

  const users = readUsers();
  const nextUsers = users.filter((user) => user.id !== req.params.id);
  if (nextUsers.length === users.length) {
    return res.status(404).json({ message: "User not found." });
  }

  writeUsers(nextUsers);
  res.json({ users: nextUsers.map(publicUser) });
});

const distPath = join(__dirname, "dist");
if (existsSync(distPath)) {
  app.use(express.static(distPath));
  app.use((_req, res) => res.sendFile(join(distPath, "index.html")));
}

ensureDatabase();
app.listen(PORT, () => {
  console.log(`AuthFlow API running on http://localhost:${PORT}`);
});
