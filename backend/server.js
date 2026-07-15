import bcrypt from "bcryptjs";
import cors from "cors";
import "dotenv/config";
import express from "express";
import { OAuth2Client } from "google-auth-library";
import jwt from "jsonwebtoken";
import { randomBytes, randomUUID } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { createServer as createHttpsServer } from "node:https";
import { join } from "node:path";
import { deflateSync, inflateSync } from "node:zlib";
import { connectDB, isMongoConnected } from "./config/db.js";
import { registerFaceAttendanceRoutes } from "./routes/faceAttendance.js";
import { registerMongoCrudRoutes } from "./routes/mongoCrud.js";
import { registerProductionFeatureRoutes } from "./routes/productionFeatures.js";
import { registerStudentPortalRoutes } from "./routes/studentPortal.js";
import { seedMongoData } from "./seed/mongoSeed.js";
import {
  Branch as MongoBranch,
  LoginHistory,
  Payroll as MongoPayroll,
  User as MongoUser,
} from "./models/index.js";

const PROJECT_DIR = process.cwd();
const BACKEND_DIR = existsSync(join(PROJECT_DIR, "server.js"))
  ? PROJECT_DIR
  : join(PROJECT_DIR, "backend");
const __dirname = BACKEND_DIR;
const app = express();
const PORT = process.env.API_PORT || process.env.PORT || 5000;
const USE_HTTPS = process.env.USE_HTTPS === "true";
const INTERNAL_HTTP_PORT = USE_HTTPS
  ? Number(process.env.INTERNAL_API_HTTP_PORT || 5001)
  : 0;
const FRONTEND_DIR = join(__dirname, "..", "frontend");
const HTTPS_KEY_PATH =
  process.env.HTTPS_KEY_PATH ||
  join(FRONTEND_DIR, "certificates", "authflow-key.pem");
const HTTPS_CERT_PATH =
  process.env.HTTPS_CERT_PATH ||
  join(FRONTEND_DIR, "certificates", "authflow.pem");
const JWT_SECRET =
  process.env.JWT_SECRET || "change-this-secret-before-production";
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "";
const ADMIN_EMAILS = (
  process.env.ADMIN_EMAILS || "jobwaytech@gmail.com,mdjobwaytech@gmail.com"
)
  .split(",")
  .map((email) => email.trim().toLowerCase())
  .filter(Boolean);
const BRANCH_ADMIN_EMAILS = (process.env.BRANCH_ADMIN_EMAILS || "")
  .split(",")
  .map((email) => email.trim().toLowerCase())
  .filter(Boolean);
const PORTAL_ADMIN_PASSWORD = process.env.PORTAL_ADMIN_PASSWORD || "";
const PORTAL_BRANCH_ADMIN_PASSWORD =
  process.env.PORTAL_BRANCH_ADMIN_PASSWORD || "";
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
const DATA_DIR = process.env.DATA_DIR || join(__dirname, "data");
const PUBLIC_DIR = join(FRONTEND_DIR, "public");
const MONTHLY_ATTENDANCE_REPORT_PDF = join(
  __dirname,
  "assets",
  "reports",
  "monthly-attendance-report.pdf",
);
const PAYSLIP_LOGO_PATHS = [
  join(PUBLIC_DIR, "assets", "job-way-tech-logo.png"),
  join(PUBLIC_DIR, "job-way-tech-logo.png"),
];
const FILES = {
  users: join(DATA_DIR, "users.json"),
  branches: join(DATA_DIR, "branches.json"),
  branchEmployees: join(DATA_DIR, "branch-employees.json"),
  branchStudents: join(DATA_DIR, "branch-students.json"),
  employees: join(DATA_DIR, "employees.json"),
  students: join(DATA_DIR, "students.json"),
  attendance: join(DATA_DIR, "attendance.json"),
  faceProfiles: join(DATA_DIR, "face-profiles.json"),
  leaves: join(DATA_DIR, "leaves.json"),
  tasks: join(DATA_DIR, "tasks.json"),
  taskAssignments: join(DATA_DIR, "task-assignments.json"),
  taskStatus: join(DATA_DIR, "task-status.json"),
  teams: join(DATA_DIR, "teams.json"),
  teamMembers: join(DATA_DIR, "team-members.json"),
  calendarEvents: join(DATA_DIR, "calendar-events.json"),
  birthdayNotifications: join(DATA_DIR, "birthday-notifications.json"),
  payroll: join(DATA_DIR, "payroll.json"),
  salarySlips: join(DATA_DIR, "salary-slips.json"),
  reports: join(DATA_DIR, "reports.json"),
  attendanceRegularization: join(DATA_DIR, "attendance-regularization.json"),
  sessions: join(DATA_DIR, "sessions.json"),
  resetTokens: join(DATA_DIR, "reset-tokens.json"),
  notifications: join(DATA_DIR, "notifications.json"),
};
const googleClient = new OAuth2Client(GOOGLE_CLIENT_ID);
const ROLES = ["super_admin", "branch_admin", "employee", "student"];
const ROLE_LABELS = {
  super_admin: "Super Admin",
  branch_admin: "Branch Admin",
  employee: "Employee",
  student: "Student",
};
const STAFF_ROLES = ["branch_admin", "employee"];
const ASSIGNABLE_ROLES = ["branch_admin", "employee", "student"];
const MANAGER_ROLES = ["super_admin", "branch_admin"];
const TASK_STATUSES = [
  "pending",
  "in_progress",
  "completed",
  "hold",
  "rejected",
];
const TASK_PRIORITIES = ["low", "medium", "high", "urgent"];
const CALENDAR_TYPES = [
  "company_holiday",
  "branch_holiday",
  "employee_event",
  "student_event",
  "meeting_reminder",
  "training_schedule",
  "exam_schedule",
];
const ATTENDANCE_LOCATION_RADIUS_METERS = Number(
  process.env.ATTENDANCE_LOCATION_RADIUS_METERS || 150,
);
const RATE_LIMIT_WINDOW_MS = Number(
  process.env.RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000,
);
const RATE_LIMIT_MAX = Number(process.env.RATE_LIMIT_MAX || 120);
const authRateBucket = new Map();

app.set("trust proxy", 1);
app.use(
  cors({
    origin(origin, callback) {
      const isCloudflareQuickTunnel =
        origin && /^https:\/\/[a-z0-9-]+\.trycloudflare\.com$/i.test(origin);
      if (
        !origin ||
        !ALLOWED_ORIGINS.length ||
        ALLOWED_ORIGINS.includes(origin) ||
        isCloudflareQuickTunnel
      )
        return callback(null, true);
      return callback(new Error("Not allowed by CORS"));
    },
    credentials: true,
  }),
);
app.use(express.json({ limit: "8mb" }));
app.use((req, _res, next) => {
  req.body ||= {};
  next();
});
app.use((req, res, next) => {
  if (
    !req.path.startsWith("/api/login") &&
    !req.path.includes("password") &&
    !req.path.includes("refresh")
  )
    return next();
  const key = `${req.ip}:${req.path}`;
  const now = Date.now();
  const item = authRateBucket.get(key) || {
    count: 0,
    resetAt: now + RATE_LIMIT_WINDOW_MS,
  };
  if (now > item.resetAt) {
    item.count = 0;
    item.resetAt = now + RATE_LIMIT_WINDOW_MS;
  }
  item.count += 1;
  authRateBucket.set(key, item);
  if (item.count > RATE_LIMIT_MAX)
    return res
      .status(429)
      .json({ message: "Too many requests. Try again later." });
  return next();
});

let runtimeReadyPromise = null;

async function ensureRuntimeReady() {
  if (!runtimeReadyPromise) {
    runtimeReadyPromise = (async () => {
      ensureDatabase();
      try {
        const connection = await connectDB();
        if (connection) await seedMongoData();
      } catch (error) {
        console.error("MongoDB startup failed:", error.message);
      }
    })();
  }
  return runtimeReadyPromise;
}

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    service: "authflow-api",
    mongo: isMongoConnected(),
    timestamp: new Date().toISOString(),
  });
});

async function recordLoginAttempt(req, email, status, message, role = "") {
  if (!isMongoConnected()) return;
  const mongoUser = await MongoUser.findOne({ email })
    .lean()
    .catch(() => null);
  await LoginHistory.create({
    userId: mongoUser?._id || null,
    email,
    role: role || mongoUser?.role || "",
    status,
    ipAddress: String(
      req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "",
    )
      .split(",")[0]
      .trim(),
    userAgent: req.headers["user-agent"] || "",
    message,
  }).catch(() => null);
}

function readJson(file, fallback) {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  if (!existsSync(file)) writeFileSync(file, JSON.stringify(fallback, null, 2));
  const raw = readFileSync(file, "utf8");
  try {
    return raw.trim() ? JSON.parse(raw) : fallback;
  } catch (error) {
    const backup = `${file}.corrupt-${Date.now()}.bak`;
    writeFileSync(backup, raw);
    writeFileSync(file, JSON.stringify(fallback, null, 2));
    console.warn(
      `Recovered malformed JSON table ${file}; backup saved to ${backup}.`,
    );
    return fallback;
  }
}

function writeJson(file, data) {
  writeFileSync(file, JSON.stringify(data, null, 2));
}

function normalizeRole(role) {
  if (role === "user") return "employee";
  return ROLES.includes(role) ? role : "employee";
}

function normalizeStoredRole(role) {
  return normalizeRole(role);
}

function validRole(role) {
  return ROLES.includes(role);
}

function ensureDemoUsers(users) {
  const upsertDemoUser = ({ email, password, role, branchId }) => {
    if (!email || !password) return;
    const existing = users.find((user) => user.email === email);
    const name = email
      .split("@")[0]
      .replace(/[._-]+/g, " ")
      .replace(/\b\w/g, (char) => char.toUpperCase());
    const nextUser = {
      ...(existing || {}),
      id: existing?.id || randomUUID(),
      name: existing?.name || name,
      email,
      passwordHash: bcrypt.hashSync(password, 10),
      role,
      branchId: branchId || null,
      provider: "password",
      createdAt: existing?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    if (existing) Object.assign(existing, nextUser);
    else users.push(nextUser);
  };

  for (const email of ADMIN_EMAILS) {
    upsertDemoUser({
      email,
      password: PORTAL_ADMIN_PASSWORD,
      role: "super_admin",
      branchId: null,
    });
  }

  const branches = readJson(FILES.branches, []);
  const defaultBranch = branches.find((branch) => branch.code === "MPL") || branches[0];
  for (const email of BRANCH_ADMIN_EMAILS) {
    upsertDemoUser({
      email,
      password: PORTAL_BRANCH_ADMIN_PASSWORD,
      role: "branch_admin",
      branchId: defaultBranch?.id || null,
    });
  }

  return users;
}

function ensureDatabase() {
  const branches = readJson(FILES.branches, []);

  let users = readJson(FILES.users, []);
  users = users.map((user) => ({
    ...user,
    role: normalizeStoredRole(user.role),
    branchId: user.branchId ?? null,
    phone: user.phone || "",
    dob: user.dob || "",
    profile: user.profile || "",
    employeeId:
      user.employeeId ||
      (STAFF_ROLES.includes(normalizeStoredRole(user.role))
        ? `EMP-${String(user.id || "")
            .slice(0, 6)
            .toUpperCase()}`
        : undefined),
    studentId:
      user.studentId ||
      (normalizeStoredRole(user.role) === "student"
        ? `STU-${String(user.id || "")
            .slice(0, 6)
            .toUpperCase()}`
        : undefined),
    salary:
      user.salary ??
      (STAFF_ROLES.includes(normalizeStoredRole(user.role))
        ? 30000
        : undefined),
  }));
  users = ensureDemoUsers(users);
  writeJson(FILES.users, users);

  for (const key of [
    "employees",
    "students",
    "faceProfiles",
    "branchEmployees",
    "branchStudents",
    "attendance",
    "leaves",
    "tasks",
    "taskAssignments",
    "taskStatus",
    "teams",
    "teamMembers",
    "calendarEvents",
    "birthdayNotifications",
    "payroll",
    "salarySlips",
    "reports",
    "attendanceRegularization",
    "sessions",
    "resetTokens",
    "notifications",
  ]) {
    readJson(FILES[key], []);
  }
  syncBranchAssignments();
  seedOperationalData();
}

function readUsers() {
  return readJson(FILES.users, []);
}

function writeUsers(users) {
  writeJson(FILES.users, users);
  syncBranchAssignments();
}

function localDateValue(value) {
  if (!value) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function mongoUserToLocalUser(mongoUser) {
  const id = String(mongoUser._id || mongoUser.id || "");
  const branchId = mongoUser.branchId ? String(mongoUser.branchId) : null;
  const dob = localDateValue(mongoUser.dob);
  const dateOfJoining = localDateValue(mongoUser.dateOfJoining);

  return {
    id,
    name: mongoUser.name || mongoUser.email,
    email: String(mongoUser.email || "").toLowerCase(),
    passwordHash: mongoUser.passwordHash || null,
    role: normalizeRole(mongoUser.role),
    branchId,
    phone: mongoUser.phone || "",
    dob,
    dateOfJoining,
    bankName: mongoUser.bankName || "",
    bankAccountNumber: mongoUser.bankAccountNumber || "",
    panNumber: mongoUser.panNumber || "",
    profile: mongoUser.profile || "",
    employeeId: mongoUser.employeeId || undefined,
    studentId: mongoUser.studentId || undefined,
    salary: mongoUser.salary ?? undefined,
    provider: mongoUser.provider || "password",
    picture: mongoUser.picture || "",
    faceSignature:
      mongoUser.faceSignature ||
      (["employee", "student"].includes(normalizeRole(mongoUser.role))
        ? "not-enrolled"
        : undefined),
    createdAt: mongoUser.createdAt
      ? new Date(mongoUser.createdAt).toISOString()
      : new Date().toISOString(),
  };
}

function upsertLocalUserFromMongo(mongoUser) {
  const localUser = mongoUserToLocalUser(mongoUser);
  const users = readUsers();
  const existing = users.find((item) => item.email === localUser.email);

  if (existing) {
    Object.assign(existing, localUser, { id: existing.id || localUser.id });
  } else {
    users.push(localUser);
  }

  writeUsers(users);
  return existing || localUser;
}

function syncBranchAssignments() {
  const users = readJson(FILES.users, []);
  const employees = users
    .filter(
      (user) => STAFF_ROLES.includes(normalizeRole(user.role)) && user.branchId,
    )
    .map((user) => ({
      id: `${user.branchId}-${user.id}`,
      branchId: user.branchId,
      userId: user.id,
      assignedAt: user.createdAt || new Date().toISOString(),
    }));
  const students = users
    .filter((user) => normalizeRole(user.role) === "student" && user.branchId)
    .map((user) => ({
      id: `${user.branchId}-${user.id}`,
      branchId: user.branchId,
      userId: user.id,
      assignedAt: user.createdAt || new Date().toISOString(),
    }));
  writeJson(
    FILES.employees,
    employees.map((row) => {
      const user = users.find((item) => item.id === row.userId);
      return {
        id: user?.employeeId || `EMP-${row.userId.slice(0, 6).toUpperCase()}`,
        userId: row.userId,
        branchId: row.branchId,
        phone: user?.phone || "",
        dob: user?.dob || "",
        salary: user?.salary || 0,
      };
    }),
  );
  writeJson(
    FILES.students,
    students.map((row) => {
      const user = users.find((item) => item.id === row.userId);
      return {
        id: user?.studentId || `STU-${row.userId.slice(0, 6).toUpperCase()}`,
        userId: row.userId,
        branchId: row.branchId,
        phone: user?.phone || "",
        dob: user?.dob || "",
      };
    }),
  );
  writeJson(FILES.branchEmployees, employees);
  writeJson(FILES.branchStudents, students);
}

function seedOperationalData() {
  readJson(FILES.teams, []);
  readJson(FILES.teamMembers, []);
}

function publicUser(user) {
  const {
    passwordHash,
    resetToken,
    ...safeUser
  } = user;
  return { ...safeUser, roleLabel: ROLE_LABELS[normalizeRole(user.role)] };
}

function createToken(user) {
  const sessionId = randomUUID();
  const token = jwt.sign(
    { id: user.id, role: normalizeRole(user.role), sessionId },
    JWT_SECRET,
    { expiresIn: "8h" },
  );
  const sessions = readJson(FILES.sessions, []);
  sessions.push({
    id: sessionId,
    userId: user.id,
    role: normalizeRole(user.role),
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString(),
    revokedAt: null,
  });
  writeJson(FILES.sessions, sessions);
  return token;
}

async function authResponseFor(user) {
  return {
    token: createToken(user),
    user: publicUser(user),
  };
}

function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

async function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token)
    return res
      .status(401)
      .json({ message: "Authentication token is required." });

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const sessions = readJson(FILES.sessions, []);
    const session = sessions.find(
      (item) => item.id === payload.sessionId && !item.revokedAt,
    );
    if (!session || new Date(session.expiresAt).getTime() < Date.now()) {
      return res.status(401).json({ message: "Session expired or revoked." });
    }
    let user = readUsers().find((item) => item.id === payload.id);
    if (!user && isMongoConnected()) {
      const mongoUser = await MongoUser.findById(payload.id)
        .lean()
        .catch(() => null);
      if (mongoUser) user = upsertLocalUserFromMongo(mongoUser);
    }
    if (!user)
      return res
        .status(401)
        .json({ message: "User session is no longer valid." });
    req.user = user;
    req.sessionId = payload.sessionId;
    next();
  } catch {
    res.status(401).json({ message: "Invalid or expired session." });
  }
}

function requireRoles(...allowedRoles) {
  return (req, res, next) => {
    if (!allowedRoles.includes(normalizeRole(req.user.role))) {
      return res
        .status(403)
        .json({ message: "You are not authorized to access this feature." });
    }
    next();
  };
}

function canManageBranch(user, branchId) {
  const role = normalizeRole(user.role);
  return (
    role === "super_admin" ||
    (role === "branch_admin" && user.branchId === branchId)
  );
}

function scopedUsersFor(user) {
  const role = normalizeRole(user.role);
  const users = readUsers();
  if (role === "super_admin") return users;
  if (role === "branch_admin")
    return users.filter((item) => item.branchId === user.branchId);
  return users.filter((item) => item.id === user.id);
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function monthKey(value = new Date()) {
  return new Date(value).toISOString().slice(0, 7);
}

function roleIsStudent(user) {
  return normalizeRole(user.role) === "student";
}

function withinMonth(dateValue, month) {
  return String(dateValue || "").startsWith(month);
}

function getClientDevice(req) {
  return {
    userAgent: req.headers["user-agent"] || "Unknown device",
    ip: req.headers["x-forwarded-for"] || req.socket.remoteAddress || "",
  };
}

function normalizeLocation(value) {
  if (!value) return null;
  const latitude = Number(value.latitude);
  const longitude = Number(value.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  return {
    latitude,
    longitude,
    address: String(value.address || "Address not resolved").trim(),
    capturedAt: new Date().toISOString(),
  };
}

function distanceMeters(start, end) {
  if (!start || !end) return Number.POSITIVE_INFINITY;
  const toRadians = (value) => (value * Math.PI) / 180;
  const earthRadius = 6371000;
  const deltaLat = toRadians(end.latitude - start.latitude);
  const deltaLon = toRadians(end.longitude - start.longitude);
  const lat1 = toRadians(start.latitude);
  const lat2 = toRadians(end.latitude);
  const a =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) ** 2;
  return earthRadius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function taskAssignmentView(assignment, task, users) {
  const assignee = users.find((user) => user.id === assignment.userId);
  const creator = users.find((user) => user.id === task.createdBy);
  return {
    ...task,
    assignmentId: assignment.id,
    assignedUserId: assignment.userId,
    employeeName: assignee?.name || "Unknown",
    assignedByName: creator?.name || "Super Admin",
    assignmentType: assignment.assignmentType || "individual",
    teamId: assignment.teamId || null,
    teamName: assignment.teamName || null,
    status: assignment.status,
    progress: assignment.progress || 0,
    remarks: assignment.remarks || "",
    assignedAt: assignment.assignedAt,
    updatedAt: assignment.updatedAt,
  };
}

function canSeeCalendarEvent(user, event) {
  const role = normalizeRole(user.role);
  if (role === "super_admin") return true;
  if (event.scope === "company") return true;
  if (event.scope === "branch") return event.branchId === user.branchId;
  return (
    event.employeeId === user.id ||
    event.studentId === user.id ||
    event.createdBy === user.id
  );
}

function calendarEventView(event, users, branches) {
  const branch = branches.find((item) => item.id === event.branchId);
  const employee = users.find((item) => item.id === event.employeeId);
  const student = users.find((item) => item.id === event.studentId);
  const creator = users.find((item) => item.id === event.createdBy);
  return {
    ...event,
    branchName: branch?.name || null,
    employeeName: employee?.name || null,
    studentName: student?.name || null,
    createdByName: creator?.name || "Super Admin",
  };
}

function birthdayEventsFor(users) {
  const today = todayKey();
  const year = today.slice(0, 4);
  return users
    .filter(
      (user) =>
        user.dob && ["employee", "student"].includes(normalizeRole(user.role)),
    )
    .map((user) => ({
      id: `birthday-${user.id}-${year}`,
      title: `Happy Birthday ${user.name}!`,
      type: "birthday",
      scope: user.branchId ? "branch" : "company",
      branchId: user.branchId || null,
      employeeId: normalizeRole(user.role) === "employee" ? user.id : null,
      studentId: normalizeRole(user.role) === "student" ? user.id : null,
      startDate: `${year}-${String(user.dob).slice(5, 10)}`,
      endDate: `${year}-${String(user.dob).slice(5, 10)}`,
      startTime: "",
      description: `Happy Birthday ${user.name}!`,
      createdBy: "system",
      createdAt: new Date().toISOString(),
    }))
    .filter((event) => event.startDate >= today);
}

function calendarNotificationsFor(events) {
  const today = todayKey();
  const limit = new Date();
  limit.setDate(limit.getDate() + 14);
  const limitKey = limit.toISOString().slice(0, 10);
  return events
    .filter((event) => event.startDate >= today && event.startDate <= limitKey)
    .sort((a, b) =>
      `${a.startDate}${a.startTime || ""}`.localeCompare(
        `${b.startDate}${b.startTime || ""}`,
      ),
    )
    .slice(0, 6);
}

function monthlyReportFor(user, month = monthKey()) {
  const users = scopedUsersFor(user).filter((item) =>
    ASSIGNABLE_ROLES.includes(normalizeRole(item.role)),
  );
  const userIds = new Set(users.map((item) => item.id));
  const attendance = readJson(FILES.attendance, []).filter(
    (item) => userIds.has(item.userId) && withinMonth(item.date, month),
  );
  const tasks = readJson(FILES.tasks, []);
  const assignments = readJson(FILES.taskAssignments, []).filter((item) =>
    userIds.has(item.userId),
  );
  const leaves = readJson(FILES.leaves, []).filter(
    (item) =>
      userIds.has(item.userId) &&
      (withinMonth(item.fromDate, month) || withinMonth(item.toDate, month)),
  );
  const payroll = readJson(FILES.payroll, []).filter(
    (item) => userIds.has(item.userId) && item.month === month,
  );
  const monthAssignments = assignments.filter(
    (item) =>
      withinMonth(item.assignedAt, month) || withinMonth(item.updatedAt, month),
  );
  const rows = users.map((employee) => {
    const employeeAttendance = attendance.filter(
      (item) => item.userId === employee.id,
    );
    const employeeTasks = monthAssignments.filter(
      (item) => item.userId === employee.id,
    );
    const completedTasks = employeeTasks.filter(
      (item) => item.status === "completed",
    ).length;
    const totalTasks = employeeTasks.length;
    const completionRate = totalTasks
      ? Math.round((completedTasks / totalTasks) * 100)
      : 0;
    return {
      employeeId: employee.id,
      employeeName: employee.name,
      role: normalizeRole(employee.role),
      branchId: employee.branchId,
      attendanceDays: employeeAttendance.length,
      attendancePercentage: Math.min(
        100,
        Math.round(
          (employeeAttendance.filter((item) => item.status === "present")
            .length /
            22) *
            100,
        ),
      ),
      completedTasks,
      totalTasks,
      completionRate,
      averageProgress: totalTasks
        ? Math.round(
            employeeTasks.reduce(
              (sum, item) => sum + Number(item.progress || 0),
              0,
            ) / totalTasks,
          )
        : 0,
      leaveRequests: leaves.filter((item) => item.userId === employee.id)
        .length,
      netPay: payroll.find((item) => item.userId === employee.id)?.netPay || 0,
    };
  });
  return {
    month,
    generatedAt: new Date().toISOString(),
    totals: {
      employees: rows.filter((row) => row.role !== "student").length,
      students: rows.filter((row) => row.role === "student").length,
      attendanceRecords: attendance.length,
      assignedTasks: monthAssignments.length,
      completedTasks: monthAssignments.filter(
        (item) => item.status === "completed",
      ).length,
      leaveRequests: leaves.length,
      payrollProcessed: payroll.length,
      payrollNetPay: payroll.reduce(
        (sum, item) => sum + Number(item.netPay || 0),
        0,
      ),
      overdueTasks: monthAssignments.filter((item) => {
        const task = tasks.find((record) => record.id === item.taskId);
        return (
          task?.deadline &&
          task.deadline < todayKey() &&
          item.status !== "completed"
        );
      }).length,
    },
    rows,
  };
}

function escapeCsv(value) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

function monthlyReportCsv(report) {
  const lines = [
    [
      "Name",
      "Role",
      "Attendance Days",
      "Attendance %",
      "Completed Tasks",
      "Total Tasks",
      "Completion Rate",
      "Average Progress",
      "Leave Requests",
      "Net Pay",
    ]
      .map(escapeCsv)
      .join(","),
    ...report.rows.map((row) =>
      [
        row.employeeName,
        row.role,
        row.attendanceDays,
        `${row.attendancePercentage}%`,
        row.completedTasks,
        row.totalTasks,
        `${row.completionRate}%`,
        `${row.averageProgress}%`,
        row.leaveRequests,
        row.netPay,
      ]
        .map(escapeCsv)
        .join(","),
    ),
  ];
  return lines.join("\n");
}

function simplePdf(title, lines) {
  const safeLines = [title, "", ...lines].map((line) =>
    String(line).replace(/[()\\]/g, "\\$&"),
  );
  const content = `BT /F1 13 Tf 50 770 Td ${safeLines.map((line, index) => `${index ? "0 -18 Td " : ""}(${line}) Tj`).join(" ")} ET`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`,
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets
    .slice(1)
    .map((offset) => `${String(offset).padStart(10, "0")} 00000 n `)
    .join("\n")}\n`;
  pdf += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf);
}

function pdfText(value) {
  return String(value ?? "").replace(/[()\\]/g, "\\$&");
}

function money(value) {
  return `Rs. ${Math.round(Number(value || 0)).toLocaleString("en-IN")}`;
}

function payrollPeriod(month) {
  return payrollPeriodRange(month).label;
}

function payrollPeriodRange(month) {
  const [yearValue, monthValue] = String(month || "")
    .split("-")
    .map(Number);
  if (!yearValue || !monthValue)
    return { from: month || "-", to: month || "-", label: month || "-" };
  const startDate = new Date(Date.UTC(yearValue, monthValue - 1, 1));
  const monthEndDate = new Date(Date.UTC(yearValue, monthValue, 0));
  const endDate = new Date(
    Date.UTC(
      yearValue,
      monthValue - 1,
      Math.min(30, monthEndDate.getUTCDate()),
    ),
  );
  const formatDate = (date) =>
    [
      String(date.getUTCDate()).padStart(2, "0"),
      String(date.getUTCMonth() + 1).padStart(2, "0"),
      date.getUTCFullYear(),
    ].join("-");
  const from = formatDate(startDate);
  const to = formatDate(endDate);
  return { from, to, label: `${from} to ${to}` };
}

function payrollCalculations(row) {
  const basicSalary = Number(row.basicSalary ?? row.salary ?? 0);
  const hra = Number(row.hra ?? Math.round(basicSalary * 0.4));
  const incentivePay = Number(row.incentivePay ?? 0);
  const bonus = Number(row.bonus ?? row.bonuses ?? 0);
  const specialAllowance = Number(row.specialAllowance ?? 0);
  const otherEarnings = Number(row.otherEarnings ?? 0);
  const grossSalary =
    basicSalary + hra + incentivePay + bonus + specialAllowance + otherEarnings;
  const providentFund = Number(
    row.providentFund ?? Math.round(basicSalary * 0.12),
  );
  const esi = Number(
    row.esi ?? (grossSalary <= 21000 ? Math.round(grossSalary * 0.0075) : 0),
  );
  const professionalTax = Number(row.professionalTax ?? 0);
  const salaryAdvance = Number(row.salaryAdvance ?? 0);
  const loan = Number(row.loan ?? 0);
  const otherDeductions = Number(row.otherDeductions ?? 0);
  const totalDeductions =
    providentFund +
    esi +
    professionalTax +
    salaryAdvance +
    loan +
    otherDeductions;
  const netSalary = grossSalary - totalDeductions;
  return {
    basicSalary,
    hra,
    incentivePay,
    bonus,
    specialAllowance,
    otherEarnings,
    grossSalary,
    providentFund,
    esi,
    professionalTax,
    salaryAdvance,
    loan,
    otherDeductions,
    totalDeductions,
    netSalary,
  };
}

function attendanceSummaryFor(userId, month) {
  const attendance = readJson(FILES.attendance, []).filter(
    (item) =>
      item.userId === userId && String(item.date || "").startsWith(month),
  );
  const workingDays = 26;
  const presentDays =
    attendance.filter((item) => item.status === "present").length || 24;
  const absentDays = Math.max(0, workingDays - presentDays - 1);
  const leaveDays = Math.max(0, workingDays - presentDays - absentDays);
  return {
    workingDays,
    presentDays,
    absentDays,
    leaveDays,
    attendancePercentage: Math.round((presentDays / workingDays) * 100),
  };
}

function normalizeMongoPayrollRow(payroll) {
  const row =
    typeof payroll.toObject === "function" ? payroll.toObject() : payroll;
  return {
    ...row,
    id: String(row._id || row.id || ""),
    userId: String(row.userId || ""),
    branchId: row.branchId ? String(row.branchId) : null,
    salary: Number(row.salary ?? row.basicSalary ?? 0),
    basicSalary: Number(row.basicSalary ?? row.salary ?? 0),
    hra: Number(row.hra ?? 0),
    incentivePay: Number(row.incentivePay ?? 0),
    bonus: Number(row.bonus ?? 0),
    specialAllowance: Number(row.specialAllowance ?? 0),
    otherEarnings: Number(row.otherEarnings ?? 0),
    providentFund: Number(row.providentFund ?? 0),
    esi: Number(row.esi ?? 0),
    professionalTax: Number(row.professionalTax ?? 0),
    salaryAdvance: Number(row.salaryAdvance ?? 0),
    loan: Number(row.loan ?? 0),
    otherDeductions: Number(row.otherDeductions ?? 0),
    totalDeductions: Number(row.totalDeductions ?? 0),
    netPay: Number(row.netPay ?? 0),
  };
}

function paethPredictor(left, up, upLeft) {
  const estimate = left + up - upLeft;
  const leftDistance = Math.abs(estimate - left);
  const upDistance = Math.abs(estimate - up);
  const upLeftDistance = Math.abs(estimate - upLeft);
  if (leftDistance <= upDistance && leftDistance <= upLeftDistance) return left;
  return upDistance <= upLeftDistance ? up : upLeft;
}

function readPngLogo() {
  const logoPath = PAYSLIP_LOGO_PATHS.find((file) => existsSync(file));
  if (!logoPath)
    throw new Error(
      "Payslip logo image not found. Expected /assets/job-way-tech-logo.png.",
    );

  const file = readFileSync(logoPath);
  const signature = "89504e470d0a1a0a";
  if (file.subarray(0, 8).toString("hex") !== signature)
    throw new Error("Payslip logo must be a PNG image.");

  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  let interlace = 0;
  const idatChunks = [];
  while (offset < file.length) {
    const length = file.readUInt32BE(offset);
    const type = file.subarray(offset + 4, offset + 8).toString("ascii");
    const data = file.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      interlace = data[12];
    } else if (type === "IDAT") {
      idatChunks.push(data);
    } else if (type === "IEND") {
      break;
    }
    offset += length + 12;
  }

  if (bitDepth !== 8 || interlace !== 0 || ![0, 2, 6].includes(colorType)) {
    throw new Error(
      "Payslip logo PNG must be non-interlaced 8-bit grayscale, RGB, or RGBA.",
    );
  }

  const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : 1;
  const bytesPerPixel = channels;
  const stride = width * channels;
  const inflated = inflateSync(Buffer.concat(idatChunks));
  const rows = Buffer.alloc(height * stride);
  let inputOffset = 0;
  for (let row = 0; row < height; row += 1) {
    const filter = inflated[inputOffset];
    if (filter > 4)
      throw new Error("Payslip logo PNG uses an unsupported row filter.");
    inputOffset += 1;
    const rowOffset = row * stride;
    const prevRowOffset = rowOffset - stride;
    for (let column = 0; column < stride; column += 1) {
      const value = inflated[inputOffset + column];
      const left =
        column >= bytesPerPixel ? rows[rowOffset + column - bytesPerPixel] : 0;
      const up = row > 0 ? rows[prevRowOffset + column] : 0;
      const upLeft =
        row > 0 && column >= bytesPerPixel
          ? rows[prevRowOffset + column - bytesPerPixel]
          : 0;
      const predictor =
        filter === 1
          ? left
          : filter === 2
            ? up
            : filter === 3
              ? Math.floor((left + up) / 2)
              : filter === 4
                ? paethPredictor(left, up, upLeft)
                : 0;
      rows[rowOffset + column] = (value + predictor) & 255;
    }
    inputOffset += stride;
  }

  const rgb = Buffer.alloc(width * height * 3);
  for (let pixel = 0; pixel < width * height; pixel += 1) {
    const source = pixel * channels;
    const target = pixel * 3;
    if (colorType === 0) {
      rgb[target] = rows[source];
      rgb[target + 1] = rows[source];
      rgb[target + 2] = rows[source];
    } else if (colorType === 2) {
      rgb[target] = rows[source];
      rgb[target + 1] = rows[source + 1];
      rgb[target + 2] = rows[source + 2];
    } else {
      const alpha = rows[source + 3] / 255;
      rgb[target] = Math.round(rows[source] * alpha + 255 * (1 - alpha));
      rgb[target + 1] = Math.round(
        rows[source + 1] * alpha + 255 * (1 - alpha),
      );
      rgb[target + 2] = Math.round(
        rows[source + 2] * alpha + 255 * (1 - alpha),
      );
    }
  }

  return { width, height, data: deflateSync(rgb) };
}

function modernPayslipPdf({ row, user, branch }) {
  const calc = payrollCalculations(row);
  const attendance = attendanceSummaryFor(row.userId, row.month);
  const period = payrollPeriodRange(row.month);
  const logo = readPngLogo();
  const logoBox = 58;
  const logoWidth =
    logo.width >= logo.height
      ? logoBox
      : Math.round((logo.width / logo.height) * logoBox);
  const logoHeight =
    logo.height >= logo.width
      ? logoBox
      : Math.round((logo.height / logo.width) * logoBox);
  const logoX = 50;
  const logoY = 694;
  const payroll = readJson(FILES.payroll, []);
  const ytdNetSalary = payroll
    .filter(
      (item) =>
        item.userId === row.userId &&
        String(item.month || "").startsWith(String(row.month).slice(0, 4)),
    )
    .reduce(
      (total, item) => total + payrollCalculations(item).netSalary,
      calc.netSalary,
    );
  const monthDate = new Date(`${row.month || "2026-05"}-01T00:00:00.000Z`);
  const payslipMonth = Number.isNaN(monthDate.getTime())
    ? row.month
    : monthDate.toLocaleDateString("en-IN", {
        month: "long",
        year: "numeric",
        timeZone: "UTC",
      });
  const paymentDate = Number.isNaN(monthDate.getTime())
    ? "-"
    : new Date(
        Date.UTC(monthDate.getUTCFullYear(), monthDate.getUTCMonth() + 1, 1),
      ).toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "long",
        year: "numeric",
        timeZone: "UTC",
      });
  const rangeDate = (value) => {
    const [day, month, year] = String(value || "")
      .split("-")
      .map(Number);
    if (!day || !month || !year) return value || "-";
    return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString(
      "en-IN",
      { day: "2-digit", month: "long", year: "numeric", timeZone: "UTC" },
    );
  };
  const amount = (value) =>
    new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(
      Math.round(Number(value) || 0),
    );
  const ones = [
    "",
    "One",
    "Two",
    "Three",
    "Four",
    "Five",
    "Six",
    "Seven",
    "Eight",
    "Nine",
    "Ten",
    "Eleven",
    "Twelve",
    "Thirteen",
    "Fourteen",
    "Fifteen",
    "Sixteen",
    "Seventeen",
    "Eighteen",
    "Nineteen",
  ];
  const tens = [
    "",
    "",
    "Twenty",
    "Thirty",
    "Forty",
    "Fifty",
    "Sixty",
    "Seventy",
    "Eighty",
    "Ninety",
  ];
  const belowHundred = (value) =>
    value < 20
      ? ones[value]
      : [tens[Math.floor(value / 10)], ones[value % 10]]
          .filter(Boolean)
          .join(" ");
  const belowThousand = (value) =>
    value >= 100
      ? [ones[Math.floor(value / 100)], "Hundred", belowHundred(value % 100)]
          .filter(Boolean)
          .join(" ")
      : belowHundred(value);
  const words = (value) => {
    const rounded = Math.round(Number(value) || 0);
    if (!rounded) return "Zero";
    return [
      [Math.floor(rounded / 10000000), "Crore"],
      [Math.floor((rounded % 10000000) / 100000), "Lakh"],
      [Math.floor((rounded % 100000) / 1000), "Thousand"],
      [rounded % 1000, ""],
    ]
      .map(([part, label]) =>
        part ? `${belowThousand(part)}${label ? ` ${label}` : ""}` : "",
      )
      .filter(Boolean)
      .join(" ");
  };

  const commands = [];
  const text = (value, x, y, size = 9, font = "F1") =>
    commands.push(
      `BT /${font} ${size} Tf ${x} ${y} Td (${pdfText(value)}) Tj ET`,
    );
  const line = (x1, y1, x2, y2) =>
    commands.push(`${x1} ${y1} m ${x2} ${y2} l S`);
  const rect = (x, y, width, height, fill = false) =>
    commands.push(`${x} ${y} ${width} ${height} re ${fill ? "f" : "S"}`);
  const blueFill = () => commands.push("0.03 0.25 0.53 rg");
  const blueStroke = () => commands.push("0.03 0.25 0.53 RG 1 w");
  const grayStroke = () => commands.push("0 0 0 rg 0.61 0.64 0.69 RG 0.7 w");
  const black = () => commands.push("0 0 0 rg 0.61 0.64 0.69 RG 0.7 w");
  const white = () => commands.push("1 1 1 rg");
  const pale = () => commands.push("0.92 0.95 0.98 rg");
  const total = () => commands.push("0.86 0.93 0.79 rg");
  const infoCell = (label, value, x, y, width = 272) => {
    pale();
    rect(x, y, 112, 24, true);
    grayStroke();
    rect(x, y, width, 24);
    line(x + 112, y, x + 112, y + 24);
    text(label, x + 8, y + 9, 8, "F2");
    text(value, x + 122, y + 9, 8);
  };
  const amountCell = (label, value, x, y, width = 260) => {
    grayStroke();
    rect(x, y, width, 25);
    line(x + width - 86, y, x + width - 86, y + 25);
    text(label, x + 8, y + 9, 8);
    text(amount(value), x + width - 70, y + 9, 8, "F2");
  };

  blueStroke();
  rect(34, 682, 544, 86);
  commands.push(
    `q ${logoWidth} 0 0 ${logoHeight} ${logoX} ${logoY} cm /Logo Do Q`,
  );
  black();
  text("JOB WAY TECH CONSULTANT & TRAINING", 156, 742, 16, "F2");
  text("Monthly Salary Slip / Payslip", 232, 723, 11, "F2");
  text(
    "Address: 429-A-24, Indira Nagar, Krishna Nagar, Madanapalle,",
    190,
    708,
    7,
  );
  text("Andhra Pradesh - 517325", 258, 698, 7);
  text(payslipMonth, 520, 724, 9, "F2");

  infoCell("Payslip Month", payslipMonth, 34, 640, 272);
  infoCell(
    "Pay Period",
    `${rangeDate(period.from)} to ${rangeDate(period.to)}`,
    306,
    640,
    272,
  );
  infoCell("Salary Payment Date", paymentDate, 34, 616, 272);
  infoCell(
    "Payslip No.",
    `JWT/PAY/${String(row.month || "").replace("-", "")}/${String(
      row.id || row.userId || "",
    )
      .slice(0, 5)
      .toUpperCase()}`,
    306,
    616,
    272,
  );
  infoCell("Payment Mode", "Bank Transfer", 34, 592, 544);

  blueFill();
  rect(34, 554, 544, 22, true);
  white();
  text("EMPLOYEE DETAILS", 46, 562, 10, "F2");
  [
    [
      ["Employee Name", user?.name || "Mr./Ms. Sample Employee"],
      ["Employee ID", user?.employeeId || row.userId || "JWT/EMP/001"],
    ],
    [
      ["Designation", user?.designation || user?.role || "HR Executive"],
      ["Department", user?.department || "Human Resources"],
    ],
    [
      [
        "Date of Joining",
        user?.createdAt
          ? new Date(user.createdAt).toLocaleDateString("en-IN", {
              day: "2-digit",
              month: "long",
              year: "numeric",
            })
          : "-",
      ],
      ["Work Location", branch?.name || "Madanapalle"],
    ],
    [
      ["Employment Type", "Full Time"],
      ["PAN Number", "ABCDE1234F"],
    ],
    [
      ["Bank Name", "HDFC Bank"],
      ["Bank Account No", "XXXXXX1234"],
    ],
    [
      ["Total Month Days", String(attendance.workingDays || 31)],
      [
        "Paid Days",
        String(attendance.presentDays || attendance.workingDays || 31),
      ],
    ],
  ].forEach((pair, index) => {
    const y = 530 - index * 24;
    infoCell(pair[0][0], pair[0][1], 34, y, 272);
    infoCell(pair[1][0], pair[1][1], 306, y, 272);
  });

  blueFill();
  rect(34, 362, 260, 22, true);
  rect(314, 362, 264, 22, true);
  white();
  text("EARNINGS", 46, 370, 10, "F2");
  text("DEDUCTIONS", 326, 370, 10, "F2");
  pale();
  rect(34, 338, 260, 24, true);
  rect(314, 338, 264, 24, true);
  grayStroke();
  rect(34, 338, 260, 24);
  rect(314, 338, 264, 24);
  line(188, 338, 188, 362);
  line(478, 338, 478, 362);
  text("Salary Component", 46, 347, 8, "F2");
  text("Amount (Rs.)", 208, 347, 8, "F2");
  text("Deduction Component", 326, 347, 8, "F2");
  text("Amount (Rs.)", 498, 347, 8, "F2");
  const earnings = [
    ["Basic Salary", calc.basicSalary],
    ["House Rent Allowance (HRA)", calc.hra],
    ["Conveyance Allowance", calc.incentivePay],
    ["Medical Allowance", calc.bonus],
    ["Special Allowance", calc.specialAllowance],
  ];
  const deductions = [
    ["Employee PF", calc.providentFund],
    ["Employee ESIC", calc.esi],
    ["Professional Tax", calc.professionalTax],
  ];
  earnings.forEach(([label, value], index) => {
    amountCell(label, value, 34, 313 - index * 25, 260);
  });
  deductions.forEach(([label, value], index) => {
    amountCell(label, value, 314, 313 - index * 25, 264);
  });
  total();
  rect(34, 188, 260, 25, true);
  rect(314, 238, 264, 25, true);
  grayStroke();
  rect(34, 188, 260, 25);
  rect(314, 238, 264, 25);
  line(188, 188, 188, 213);
  line(478, 238, 478, 263);
  text("Net Salary", 46, 197, 8, "F2");
  text(amount(calc.netSalary), 208, 197, 8, "F2");
  text("Net Salary Payable", 326, 249, 10, "F2");
  text(`Rs. ${amount(calc.netSalary)}`, 500, 249, 10, "F2");
  amountCell("Employer PF Contribution", calc.providentFund, 34, 163, 260);
  amountCell("Employer ESIC Contribution", calc.esi, 34, 138, 260);
  total();
  rect(34, 113, 260, 25, true);
  grayStroke();
  rect(34, 113, 260, 25);
  line(188, 113, 188, 138);
  text("Gross Salary", 46, 122, 8, "F2");
  text(amount(calc.grossSalary), 208, 122, 8, "F2");
  black();
  text("Amount in Words:", 314, 215, 8, "F2");
  text(`Rupees ${words(calc.netSalary)} Only`, 314, 202, 8);

  commands.push("0.61 0.64 0.69 RG 0.7 w [3 3] 0 d");
  line(34, 70, 578, 70);
  commands.push("[] 0 d");
  text(
    "This is a system-generated payslip and does not require a physical signature.",
    144,
    46,
    8,
    "F2",
  );

  const content = commands.join("\n");
  const parts = [Buffer.from("%PDF-1.4\n")];
  const offsets = [];
  let byteLength = parts[0].length;
  const addPart = (part) => {
    const buffer = Buffer.isBuffer(part) ? part : Buffer.from(part);
    parts.push(buffer);
    byteLength += buffer.length;
  };
  const addObject = (objectNumber, ...objectParts) => {
    offsets.push(byteLength);
    addPart(`${objectNumber} 0 obj\n`);
    objectParts.forEach(addPart);
    addPart("\nendobj\n");
  };

  addObject(1, "<< /Type /Catalog /Pages 2 0 R >>");
  addObject(2, "<< /Type /Pages /Kids [3 0 R] /Count 1 >>");
  addObject(
    3,
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> /XObject << /Logo 6 0 R >> >> /Contents 7 0 R >>",
  );
  addObject(4, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  addObject(5, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>");
  addObject(
    6,
    `<< /Type /XObject /Subtype /Image /Width ${logo.width} /Height ${logo.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode /Length ${logo.data.length} >>\nstream\n`,
    logo.data,
    "\nendstream",
  );
  addObject(
    7,
    `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`,
  );

  const xref = byteLength;
  addPart(
    `xref\n0 8\n0000000000 65535 f \n${offsets.map((offset) => `${String(offset).padStart(10, "0")} 00000 n `).join("\n")}\n`,
  );
  addPart(`trailer << /Size 8 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`);
  return Buffer.concat(parts);
}

function imageSignature(imageData) {
  if (!imageData) return "not-enrolled";
  const sample = String(imageData)
    .replace(/^data:image\/\w+;base64,/, "")
    .slice(0, 16000);
  let hash = 0;
  for (let index = 0; index < sample.length; index += 1) {
    hash = (hash * 31 + sample.charCodeAt(index)) >>> 0;
  }
  return String(hash);
}

function verifyDemoFace(user, signature) {
  const faceProfiles = readJson(FILES.faceProfiles, []);
  const duplicate = faceProfiles.find(
    (profile) => profile.signature === signature && profile.userId !== user.id,
  );
  if (duplicate) {
    return {
      ok: false,
      message: "This face profile is already enrolled for another account.",
    };
  }

  const profile = faceProfiles.find((item) => item.userId === user.id);
  if (!profile) {
    faceProfiles.push({
      id: randomUUID(),
      userId: user.id,
      role: normalizeRole(user.role),
      signature,
      enrolledAt: new Date().toISOString(),
      lastVerifiedAt: new Date().toISOString(),
    });
    writeJson(FILES.faceProfiles, faceProfiles);
    return { ok: true, enrolled: true };
  }

  profile.lastVerifiedAt = new Date().toISOString();
  profile.lastSignature = signature;
  writeJson(FILES.faceProfiles, faceProfiles);
  return { ok: true, enrolled: false };
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "AuthFlow RBAC API" });
});

app.get("/api/config", (_req, res) => {
  res.json({
    googleClientId: GOOGLE_CLIENT_ID,
    roles: ROLES.map((id) => ({ id, label: ROLE_LABELS[id] })),
  });
});

app.post("/api/register", async (req, res) => {
  const name = String(req.body.name || "").trim();
  const email = String(req.body.email || "")
    .trim()
    .toLowerCase();
  const password = String(req.body.password || "");
  const role = String(req.body.role || "");
  const branchId = req.body.branchId || null;
  const phone = String(req.body.phone || "").trim();
  const dob = String(req.body.dob || "").trim();
  const dateOfJoining = String(req.body.dateOfJoining || "").trim();
  const bankName = String(req.body.bankName || "").trim();
  const bankAccountNumber = String(req.body.bankAccountNumber || "").trim();
  const panNumber = String(req.body.panNumber || "").trim().toUpperCase();
  const profile = String(req.body.profile || "").trim();
  const salary = Number(req.body.salary || 0);

  if (!name) return res.status(400).json({ message: "Full name is required." });
  if (!validateEmail(email))
    return res.status(400).json({ message: "Enter a valid email address." });
  if (password.length < 6)
    return res
      .status(400)
      .json({ message: "Password must be at least 6 characters." });
  if (!validRole(role))
    return res.status(400).json({ message: "Choose a valid role." });
  if (role !== "super_admin" && !branchId)
    return res
      .status(400)
      .json({ message: "Branch is required for this role." });
  if (dob && Number.isNaN(new Date(dob).getTime()))
    return res.status(400).json({ message: "Enter a valid DOB." });
  if (dateOfJoining && Number.isNaN(new Date(dateOfJoining).getTime()))
    return res.status(400).json({ message: "Enter a valid date of joining." });
  if (
    branchId &&
    !readJson(FILES.branches, []).some((branch) => branch.id === branchId)
  )
    return res.status(400).json({ message: "Selected branch was not found." });

  const users = readUsers();
  if (users.some((user) => user.email === email))
    return res
      .status(409)
      .json({ message: "This email is already registered." });

  const newUser = {
    id: randomUUID(),
    name,
    email,
    passwordHash: await bcrypt.hash(password, 10),
    role,
    branchId,
    phone,
    dob,
    dateOfJoining,
    bankName,
    bankAccountNumber,
    panNumber,
    profile,
    employeeId: STAFF_ROLES.includes(role)
      ? `EMP-${String(users.length + 1001).padStart(4, "0")}`
      : undefined,
    studentId:
      role === "student"
        ? `STU-${String(users.length + 2001).padStart(4, "0")}`
        : undefined,
    salary: STAFF_ROLES.includes(role) ? salary : undefined,
    provider: "password",
    faceSignature: ["employee", "student"].includes(role)
      ? "not-enrolled"
      : undefined,
    createdAt: new Date().toISOString(),
  };

  users.push(newUser);
  writeUsers(users);
  res.status(201).json({ user: publicUser(newUser) });
});

app.post("/api/login", async (req, res) => {
  const email = String(req.body.email || "")
    .trim()
    .toLowerCase();
  const password = String(req.body.password || "");
  const requestedRole = req.body.role ? String(req.body.role) : null;
  let user = readUsers().find((item) => item.email === email);
  let passwordMatches = Boolean(
    user?.passwordHash && (await bcrypt.compare(password, user.passwordHash)),
  );

  if (!passwordMatches && isMongoConnected()) {
    const mongoUser = await MongoUser.findOne({ email })
      .lean()
      .catch(() => null);
    if (mongoUser?.passwordHash) {
      passwordMatches = await bcrypt
        .compare(password, mongoUser.passwordHash)
        .catch(() => false);
      if (!passwordMatches && password === mongoUser.passwordHash) {
        const passwordHash = await bcrypt.hash(password, 10);
        await MongoUser.updateOne(
          { _id: mongoUser._id },
          { passwordHash },
        ).catch(() => null);
        mongoUser.passwordHash = passwordHash;
        passwordMatches = true;
      }

      if (passwordMatches) user = upsertLocalUserFromMongo(mongoUser);
    }
  }

  if (!user?.passwordHash || !passwordMatches) {
    await recordLoginAttempt(
      req,
      email,
      "failed",
      "Invalid email or password.",
      requestedRole || "",
    );
    return res.status(401).json({ message: "Invalid email or password." });
  }
  if (requestedRole && !validRole(requestedRole)) {
    await recordLoginAttempt(
      req,
      email,
      "failed",
      "Invalid role selected.",
      requestedRole,
    );
    return res.status(400).json({ message: "Choose a valid role." });
  }
  if (requestedRole && normalizeRole(user.role) !== requestedRole) {
    await recordLoginAttempt(
      req,
      email,
      "failed",
      "Role mismatch.",
      requestedRole,
    );
    return res
      .status(403)
      .json({
        message: `This account is registered as ${ROLE_LABELS[normalizeRole(user.role)]}.`,
      });
  }

  await recordLoginAttempt(
    req,
    email,
    "success",
    "Login successful.",
    normalizeRole(user.role),
  );
  res.json(await authResponseFor(user));
});

app.post("/api/logout", requireAuth, (req, res) => {
  const sessions = readJson(FILES.sessions, []);
  const session = sessions.find((item) => item.id === req.sessionId);
  if (session) session.revokedAt = new Date().toISOString();
  writeJson(FILES.sessions, sessions);
  res.json({ ok: true });
});

app.post("/api/forgot-password", (req, res) => {
  const email = String(req.body.email || "")
    .trim()
    .toLowerCase();
  const users = readUsers();
  const user = users.find((item) => item.email === email);
  if (!user)
    return res.json({
      message: "If this email exists, a reset token has been generated.",
    });
  const resetTokens = readJson(FILES.resetTokens, []);
  const token = randomBytes(24).toString("hex");
  resetTokens.push({
    token,
    userId: user.id,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    usedAt: null,
  });
  writeJson(FILES.resetTokens, resetTokens);
  res.json({
    message: "Reset token generated for demo use.",
    resetToken: token,
  });
});

app.post("/api/reset-password", async (req, res) => {
  const token = String(req.body.token || "");
  const password = String(req.body.password || "");
  if (password.length < 6)
    return res
      .status(400)
      .json({ message: "Password must be at least 6 characters." });
  const resetTokens = readJson(FILES.resetTokens, []);
  const reset = resetTokens.find(
    (item) => item.token === token && !item.usedAt,
  );
  if (!reset || new Date(reset.expiresAt).getTime() < Date.now())
    return res.status(401).json({ message: "Invalid or expired reset token." });
  const users = readUsers();
  const user = users.find((item) => item.id === reset.userId);
  if (!user) return res.status(404).json({ message: "User not found." });
  user.passwordHash = await bcrypt.hash(password, 10);
  reset.usedAt = new Date().toISOString();
  writeUsers(users);
  writeJson(FILES.resetTokens, resetTokens);
  res.json({ message: "Password changed successfully." });
});

app.post("/api/google-login", async (req, res) => {
  if (!GOOGLE_CLIENT_ID)
    return res
      .status(500)
      .json({
        message:
          "Google login is not configured. Add GOOGLE_CLIENT_ID to your environment.",
      });
  const credential = String(req.body.credential || "");
  if (!credential)
    return res.status(400).json({ message: "Google credential is required." });

  try {
    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    const email = String(payload.email || "").toLowerCase();
    if (!payload.email_verified)
      return res
        .status(403)
        .json({ message: "Your Google email must be verified." });

    const users = readUsers();
    let user = users.find((item) => item.email === email);
    if (!user) {
      user = {
        id: randomUUID(),
        name: payload.name || email,
        email,
        passwordHash: null,
        role: ADMIN_EMAILS.includes(email) ? "super_admin" : "employee",
        branchId: "branch-hyd-main",
        provider: "google",
        googleSub: payload.sub,
        picture: payload.picture,
        createdAt: new Date().toISOString(),
      };
      users.push(user);
    } else {
      user.provider = user.provider || "google";
      user.googleSub = payload.sub;
      user.picture = payload.picture;
    }
    writeUsers(users);
    res.json(await authResponseFor(user));
  } catch {
    res.status(401).json({ message: "Google sign-in verification failed." });
  }
});

app.get("/api/me", requireAuth, (req, res) => {
  res.json({ user: publicUser(req.user) });
});

app.get(
  "/api/users",
  requireAuth,
  requireRoles("super_admin", "branch_admin"),
  (req, res) => {
    res.json({ users: scopedUsersFor(req.user).map(publicUser) });
  },
);

app.delete(
  "/api/users/:id",
  requireAuth,
  requireRoles("super_admin", "branch_admin"),
  (req, res) => {
    if (req.params.id === req.user.id)
      return res
        .status(400)
        .json({ message: "You cannot delete the current session user." });
    const users = readUsers();
    const target = users.find((user) => user.id === req.params.id);
    if (!target) return res.status(404).json({ message: "User not found." });
    if (!canManageBranch(req.user, target.branchId))
      return res
        .status(403)
        .json({ message: "You cannot manage users outside your branch." });
    const nextUsers = users.filter((user) => user.id !== req.params.id);
    writeUsers(nextUsers);
    res.json({
      users: scopedUsersFor(req.user)
        .filter((user) => user.id !== req.params.id)
        .map(publicUser),
    });
  },
);

app.put(
  "/api/users/:id",
  requireAuth,
  requireRoles("super_admin", "branch_admin"),
  async (req, res) => {
    const users = readUsers();
    const target = users.find((user) => user.id === req.params.id);
    if (!target) return res.status(404).json({ message: "User not found." });
    if (!canManageBranch(req.user, target.branchId))
      return res
        .status(403)
        .json({ message: "You cannot manage users outside your branch." });
    const nextBranchId =
      req.body.branchId === undefined
        ? target.branchId
        : req.body.branchId || null;
    if (nextBranchId && !canManageBranch(req.user, nextBranchId))
      return res
        .status(403)
        .json({ message: "You cannot move users outside your branch." });
    Object.assign(target, {
      name: String(req.body.name || target.name).trim(),
      phone: String(req.body.phone ?? target.phone ?? "").trim(),
      dob: String(req.body.dob ?? target.dob ?? "").trim(),
      dateOfJoining: String(
        req.body.dateOfJoining ?? target.dateOfJoining ?? "",
      ).trim(),
      bankName: String(req.body.bankName ?? target.bankName ?? "").trim(),
      bankAccountNumber: String(
        req.body.bankAccountNumber ?? target.bankAccountNumber ?? "",
      ).trim(),
      panNumber: String(req.body.panNumber ?? target.panNumber ?? "")
        .trim()
        .toUpperCase(),
      profile: String(req.body.profile ?? target.profile ?? "").trim(),
      branchId: nextBranchId,
      salary:
        req.body.salary === undefined
          ? target.salary
          : Number(req.body.salary || 0),
      updatedAt: new Date().toISOString(),
    });
    if (req.body.password)
      target.passwordHash = await bcrypt.hash(String(req.body.password), 10);
    writeUsers(users);
    res.json({ user: publicUser(target) });
  },
);

app.get(
  "/api/branches",
  requireAuth,
  requireRoles("super_admin", "branch_admin"),
  (req, res) => {
    const branches = readJson(FILES.branches, []);
    const scopedBranches =
      normalizeRole(req.user.role) === "branch_admin"
        ? branches.filter((branch) => branch.id === req.user.branchId)
        : branches;
    const users = readUsers();
    res.json({
      branches: scopedBranches.map((branch) => ({
        ...branch,
        employees: users.filter(
          (user) =>
            user.branchId === branch.id &&
            STAFF_ROLES.includes(normalizeRole(user.role)),
        ).length,
        students: users.filter(
          (user) =>
            user.branchId === branch.id &&
            normalizeRole(user.role) === "student",
        ).length,
      })),
    });
  },
);

app.post(
  "/api/branches",
  requireAuth,
  requireRoles("super_admin"),
  (req, res) => {
    const branches = readJson(FILES.branches, []);
    const branch = {
      id: randomUUID(),
      name: String(req.body.name || "").trim(),
      code: String(req.body.code || "")
        .trim()
        .toUpperCase(),
      address: String(req.body.address || "").trim(),
      manager: String(req.body.manager || "").trim(),
      contactEmail: String(req.body.contactEmail || "")
        .trim()
        .toLowerCase(),
      contactPhone: String(req.body.contactPhone || "").trim(),
      createdAt: new Date().toISOString(),
    };
    if (!branch.name || !branch.code || !branch.address)
      return res
        .status(400)
        .json({ message: "Branch name, code, and address are required." });
    if (branches.some((item) => item.code === branch.code))
      return res.status(409).json({ message: "Branch code already exists." });
    branches.push(branch);
    writeJson(FILES.branches, branches);
    res.status(201).json({ branch });
  },
);

app.put(
  "/api/branches/:id",
  requireAuth,
  requireRoles("super_admin"),
  (req, res) => {
    const branches = readJson(FILES.branches, []);
    const branch = branches.find((item) => item.id === req.params.id);
    if (!branch) return res.status(404).json({ message: "Branch not found." });
    Object.assign(branch, {
      name: String(req.body.name || branch.name).trim(),
      code: String(req.body.code || branch.code)
        .trim()
        .toUpperCase(),
      address: String(req.body.address || branch.address).trim(),
      manager: String(req.body.manager || branch.manager).trim(),
      contactEmail: String(req.body.contactEmail || branch.contactEmail)
        .trim()
        .toLowerCase(),
      contactPhone: String(req.body.contactPhone || branch.contactPhone).trim(),
      updatedAt: new Date().toISOString(),
    });
    writeJson(FILES.branches, branches);
    res.json({ branch });
  },
);

app.delete(
  "/api/branches/:id",
  requireAuth,
  requireRoles("super_admin"),
  (req, res) => {
    const branches = readJson(FILES.branches, []);
    const users = readUsers();
    if (users.some((user) => user.branchId === req.params.id))
      return res
        .status(409)
        .json({ message: "Move branch users before deleting this branch." });
    const nextBranches = branches.filter(
      (branch) => branch.id !== req.params.id,
    );
    if (nextBranches.length === branches.length)
      return res.status(404).json({ message: "Branch not found." });
    writeJson(FILES.branches, nextBranches);
    res.json({ branches: nextBranches });
  },
);

app.get(
  "/api/reports/branches",
  requireAuth,
  requireRoles("super_admin", "branch_admin"),
  (req, res) => {
    const branches = readJson(FILES.branches, []);
    const users = scopedUsersFor(req.user);
    const attendance = readJson(FILES.attendance, []);
    const leaves = readJson(FILES.leaves, []);
    const visibleBranchIds = new Set(
      users.map((user) => user.branchId).filter(Boolean),
    );
    res.json({
      reports: branches
        .filter(
          (branch) =>
            visibleBranchIds.has(branch.id) ||
            normalizeRole(req.user.role) === "super_admin",
        )
        .map((branch) => ({
          branchId: branch.id,
          branchName: branch.name,
          employees: users.filter(
            (user) =>
              user.branchId === branch.id &&
              STAFF_ROLES.includes(normalizeRole(user.role)),
          ).length,
          students: users.filter(
            (user) =>
              user.branchId === branch.id &&
              normalizeRole(user.role) === "student",
          ).length,
          attendanceToday: attendance.filter(
            (item) => item.branchId === branch.id && item.date === todayKey(),
          ).length,
          pendingLeaves: leaves.filter(
            (item) => item.branchId === branch.id && item.status === "pending",
          ).length,
        })),
    });
  },
);

app.post(
  "/api/attendance/clock-in",
  requireAuth,
  requireRoles("employee", "student", "branch_admin"),
  (req, res) => {
    const users = readUsers();
    const user = users.find((item) => item.id === req.user.id);
    const signature = imageSignature(req.body.imageData);
    const location = normalizeLocation(req.body.location);
    if (!req.body.imageData)
      return res
        .status(400)
        .json({ message: "Camera verification image is required." });
    if (!location)
      return res
        .status(400)
        .json({ message: "GPS location is required for attendance." });
    const faceResult = verifyDemoFace(user, signature);
    if (!faceResult.ok)
      return res
        .status(403)
        .json({
          message:
            faceResult.message || "Face verification failed for this account.",
        });
    if (!user.faceSignature || user.faceSignature === "not-enrolled") {
      user.faceSignature = signature;
      writeUsers(users);
    }
    const attendance = readJson(FILES.attendance, []);
    const existing = attendance.find(
      (item) => item.userId === user.id && item.date === todayKey(),
    );
    if (existing?.clockInAt)
      return res
        .status(409)
        .json({ message: "Clock-in already recorded for today." });
    const record = {
      id: randomUUID(),
      userId: user.id,
      branchId: user.branchId,
      date: todayKey(),
      clockInAt: new Date().toISOString(),
      clockOutAt: null,
      clockInLocation: location,
      clockOutLocation: null,
      locationDistanceMeters: null,
      allowedRadiusMeters: ATTENDANCE_LOCATION_RADIUS_METERS,
      deviceInfo: { clockIn: getClientDevice(req), clockOut: null },
      status: "present",
      invalidReason: null,
      verification: "camera-face-signature",
      faceMatch: true,
    };
    attendance.push(record);
    writeJson(FILES.attendance, attendance);
    res
      .status(201)
      .json({ attendance: record, enrolledFace: faceResult.enrolled });
  },
);

app.post(
  "/api/attendance/clock-out",
  requireAuth,
  requireRoles("employee", "student", "branch_admin"),
  (req, res) => {
    const users = readUsers();
    const user = users.find((item) => item.id === req.user.id);
    const signature = imageSignature(req.body.imageData);
    const location = normalizeLocation(req.body.location);
    if (!req.body.imageData)
      return res
        .status(400)
        .json({ message: "Camera verification image is required." });
    if (!location)
      return res
        .status(400)
        .json({ message: "GPS location is required for clock-out." });
    const faceResult = verifyDemoFace(user, signature);
    if (!faceResult.ok)
      return res
        .status(403)
        .json({
          message:
            faceResult.message || "Face verification failed for this account.",
        });
    const attendance = readJson(FILES.attendance, []);
    const record = attendance.find(
      (item) => item.userId === req.user.id && item.date === todayKey(),
    );
    if (!record?.clockInAt)
      return res.status(400).json({ message: "Clock in before clocking out." });
    if (record.clockOutAt)
      return res
        .status(409)
        .json({ message: "Clock-out already recorded for today." });
    if (!record.clockInLocation) {
      record.clockInLocation = location;
    }
    const distance = Math.round(
      distanceMeters(record.clockInLocation, location),
    );
    record.clockOutAt = new Date().toISOString();
    record.clockOutLocation = location;
    record.locationDistanceMeters = distance;
    record.deviceInfo = {
      ...(record.deviceInfo || {}),
      clockOut: getClientDevice(req),
    };
    if (distance > ATTENDANCE_LOCATION_RADIUS_METERS) {
      record.status = "invalid";
      record.invalidReason = `Clock-out location is ${distance}m from clock-in, above the ${ATTENDANCE_LOCATION_RADIUS_METERS}m allowed range.`;
    } else {
      record.status = "present";
      record.invalidReason = null;
    }
    writeJson(FILES.attendance, attendance);
    res.json({ attendance: record });
  },
);

app.get("/api/attendance", requireAuth, (req, res) => {
  const attendance = readJson(FILES.attendance, []);
  const users = scopedUsersFor(req.user);
  const userIds = new Set(users.map((user) => user.id));
  const records = ["employee", "student"].includes(normalizeRole(req.user.role))
    ? attendance.filter((item) => item.userId === req.user.id)
    : attendance.filter((item) => userIds.has(item.userId));
  res.json({
    attendance: records.map((record) => ({
      ...record,
      employeeName:
        users.find((user) => user.id === record.userId)?.name || "Unknown",
    })),
  });
});

app.post(
  "/api/leaves",
  requireAuth,
  requireRoles("employee", "student", "branch_admin"),
  (req, res) => {
    const leaveType = String(req.body.leaveType || "").trim();
    const fromDate = String(req.body.fromDate || "").trim();
    const toDate = String(req.body.toDate || "").trim();
    const reason = String(req.body.reason || "").trim();
    if (!["casual", "sick", "permission"].includes(leaveType))
      return res
        .status(400)
        .json({ message: "Choose casual, sick, or permission leave." });
    if (!fromDate || !toDate || !reason)
      return res
        .status(400)
        .json({ message: "Dates and reason are required." });
    const leaves = readJson(FILES.leaves, []);
    const leave = {
      id: randomUUID(),
      userId: req.user.id,
      branchId: req.user.branchId,
      leaveType,
      fromDate,
      toDate,
      reason,
      status: "pending",
      decidedBy: null,
      decidedAt: null,
      createdAt: new Date().toISOString(),
    };
    leaves.push(leave);
    writeJson(FILES.leaves, leaves);
    res.status(201).json({ leave });
  },
);

app.get("/api/leaves", requireAuth, (req, res) => {
  const leaves = readJson(FILES.leaves, []);
  const users = scopedUsersFor(req.user);
  const userIds = new Set(users.map((user) => user.id));
  const records = ["employee", "student"].includes(normalizeRole(req.user.role))
    ? leaves.filter((item) => item.userId === req.user.id)
    : leaves.filter((item) => userIds.has(item.userId));
  res.json({
    leaves: records.map((leave) => ({
      ...leave,
      employeeName:
        users.find((user) => user.id === leave.userId)?.name || "Unknown",
    })),
  });
});

app.put(
  "/api/leaves/:id/status",
  requireAuth,
  requireRoles("super_admin", "branch_admin"),
  (req, res) => {
    const status = String(req.body.status || "");
    if (!["approved", "rejected"].includes(status))
      return res
        .status(400)
        .json({ message: "Status must be approved or rejected." });
    const leaves = readJson(FILES.leaves, []);
    const leave = leaves.find((item) => item.id === req.params.id);
    if (!leave)
      return res.status(404).json({ message: "Leave request not found." });
    if (!canManageBranch(req.user, leave.branchId))
      return res
        .status(403)
        .json({ message: "You cannot manage leave outside your branch." });
    leave.status = status;
    leave.decidedBy = req.user.id;
    leave.decidedAt = new Date().toISOString();
    writeJson(FILES.leaves, leaves);
    res.json({ leave });
  },
);

app.get("/api/tasks", requireAuth, (req, res) => {
  const tasks = readJson(FILES.tasks, []);
  const assignments = readJson(FILES.taskAssignments, []);
  const users = scopedUsersFor(req.user);
  const userIds = new Set(users.map((user) => user.id));
  const visibleAssignments = ["employee", "student"].includes(
    normalizeRole(req.user.role),
  )
    ? assignments.filter((assignment) => assignment.userId === req.user.id)
    : assignments.filter((assignment) => userIds.has(assignment.userId));
  res.json({
    tasks: visibleAssignments
      .map((assignment) => {
        const task = tasks.find((item) => item.id === assignment.taskId);
        return task ? taskAssignmentView(assignment, task, users) : null;
      })
      .filter(Boolean),
  });
});

app.get("/api/teams", requireAuth, (req, res) => {
  const teams = readJson(FILES.teams, []);
  const members = readJson(FILES.teamMembers, []);
  const users = scopedUsersFor(req.user);
  const userIds = new Set(users.map((user) => user.id));
  const visibleTeams = teams
    .filter(
      (team) =>
        canManageBranch(req.user, team.branchId) ||
        members.some(
          (member) =>
            member.teamId === team.id && member.userId === req.user.id,
        ),
    )
    .map((team) => ({
      ...team,
      members: members
        .filter(
          (member) => member.teamId === team.id && userIds.has(member.userId),
        )
        .map((member) => ({
          ...member,
          name:
            users.find((user) => user.id === member.userId)?.name || "Unknown",
        })),
    }));
  res.json({ teams: visibleTeams });
});

app.post(
  "/api/teams",
  requireAuth,
  requireRoles("super_admin", "branch_admin"),
  (req, res) => {
    const name = String(req.body.name || "").trim();
    const branchId = req.body.branchId || req.user.branchId;
    const type = String(req.body.type || "employee");
    const memberIds = Array.isArray(req.body.memberIds)
      ? req.body.memberIds
      : [];
    if (!name || !branchId)
      return res
        .status(400)
        .json({ message: "Team name and branch are required." });
    if (!canManageBranch(req.user, branchId))
      return res
        .status(403)
        .json({ message: "You cannot create teams outside your branch." });
    const users = readUsers();
    const members = users.filter(
      (user) => memberIds.includes(user.id) && user.branchId === branchId,
    );
    const teams = readJson(FILES.teams, []);
    const teamMembers = readJson(FILES.teamMembers, []);
    const team = {
      id: randomUUID(),
      name,
      branchId,
      type,
      createdBy: req.user.id,
      createdAt: new Date().toISOString(),
    };
    teams.push(team);
    for (const user of members) {
      teamMembers.push({
        id: randomUUID(),
        teamId: team.id,
        userId: user.id,
        role: normalizeRole(user.role),
        addedAt: new Date().toISOString(),
      });
    }
    writeJson(FILES.teams, teams);
    writeJson(FILES.teamMembers, teamMembers);
    res.status(201).json({ team });
  },
);

app.post(
  "/api/tasks",
  requireAuth,
  requireRoles("super_admin", "branch_admin"),
  (req, res) => {
    const title = String(req.body.title || "").trim();
    const description = String(req.body.description || "").trim();
    const priority = String(req.body.priority || "medium");
    const deadline = String(req.body.deadline || "").trim();
    let assignedUserIds = Array.isArray(req.body.assignedUserIds)
      ? req.body.assignedUserIds
      : [req.body.assignedUserId].filter(Boolean);
    const teamId = req.body.teamId || null;
    let teamName = null;
    if (teamId) {
      const team = readJson(FILES.teams, []).find((item) => item.id === teamId);
      if (!team)
        return res
          .status(400)
          .json({ message: "Selected team was not found." });
      if (!canManageBranch(req.user, team.branchId))
        return res
          .status(403)
          .json({
            message: "You cannot assign tasks to teams outside your branch.",
          });
      teamName = team.name;
      assignedUserIds = readJson(FILES.teamMembers, [])
        .filter((member) => member.teamId === teamId)
        .map((member) => member.userId);
    }
    if (!title || !deadline || !assignedUserIds.length)
      return res
        .status(400)
        .json({ message: "Task title, deadline, and assignee are required." });
    if (!TASK_PRIORITIES.includes(priority))
      return res
        .status(400)
        .json({ message: "Choose low, medium, high, or urgent priority." });

    const users = readUsers();
    const assignees = users.filter(
      (user) =>
        assignedUserIds.includes(user.id) &&
        ASSIGNABLE_ROLES.includes(normalizeRole(user.role)),
    );
    if (assignees.length !== assignedUserIds.length)
      return res
        .status(400)
        .json({ message: "One or more assignees are invalid." });
    if (assignees.some((user) => !canManageBranch(req.user, user.branchId)))
      return res
        .status(403)
        .json({ message: "You cannot assign tasks outside your branch." });

    const tasks = readJson(FILES.tasks, []);
    const assignments = readJson(FILES.taskAssignments, []);
    const statusRows = readJson(FILES.taskStatus, []);
    const task = {
      id: randomUUID(),
      title,
      description,
      priority,
      deadline,
      branchId: assignees[0]?.branchId || req.user.branchId,
      createdBy: req.user.id,
      createdAt: new Date().toISOString(),
    };
    tasks.push(task);
    for (const assignee of assignees) {
      const assignment = {
        id: randomUUID(),
        taskId: task.id,
        userId: assignee.id,
        status: "pending",
        progress: 0,
        remarks: "",
        assignedBy: req.user.id,
        assignmentType: teamId ? "team" : "individual",
        teamId,
        teamName,
        assignedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      assignments.push(assignment);
      statusRows.push({
        id: randomUUID(),
        assignmentId: assignment.id,
        status: "pending",
        progress: 0,
        remarks: "Task assigned",
        changedBy: req.user.id,
        changedAt: assignment.assignedAt,
      });
    }
    writeJson(FILES.tasks, tasks);
    writeJson(FILES.taskAssignments, assignments);
    writeJson(FILES.taskStatus, statusRows);
    res.status(201).json({ task });
  },
);

app.put("/api/tasks/:assignmentId/status", requireAuth, (req, res) => {
  const status = String(req.body.status || "");
  const progress = Number(req.body.progress ?? 0);
  const remarks = String(req.body.remarks || "").trim();
  if (!TASK_STATUSES.includes(status))
    return res.status(400).json({ message: "Choose a valid task status." });
  if (!Number.isFinite(progress) || progress < 0 || progress > 100)
    return res
      .status(400)
      .json({ message: "Progress must be between 0 and 100." });

  const assignments = readJson(FILES.taskAssignments, []);
  const assignment = assignments.find(
    (item) => item.id === req.params.assignmentId,
  );
  if (!assignment)
    return res.status(404).json({ message: "Task assignment not found." });
  const assignee = readUsers().find((user) => user.id === assignment.userId);
  const isOwner = assignment.userId === req.user.id;
  if (!isOwner && !canManageBranch(req.user, assignee?.branchId))
    return res.status(403).json({ message: "You cannot update this task." });

  assignment.status = status;
  assignment.progress = status === "completed" ? 100 : progress;
  assignment.remarks = remarks;
  assignment.updatedAt = new Date().toISOString();
  const statusRows = readJson(FILES.taskStatus, []);
  statusRows.push({
    id: randomUUID(),
    assignmentId: assignment.id,
    status: assignment.status,
    progress: assignment.progress,
    remarks,
    changedBy: req.user.id,
    changedAt: assignment.updatedAt,
  });
  writeJson(FILES.taskAssignments, assignments);
  writeJson(FILES.taskStatus, statusRows);
  res.json({ assignment });
});

app.get("/api/calendar/events", requireAuth, (req, res) => {
  const events = readJson(FILES.calendarEvents, []);
  const users = readUsers();
  const branches = readJson(FILES.branches, []);
  const visibleEvents = [...events, ...birthdayEventsFor(users)]
    .filter((event) => canSeeCalendarEvent(req.user, event))
    .sort((a, b) =>
      `${a.startDate}${a.startTime || ""}`.localeCompare(
        `${b.startDate}${b.startTime || ""}`,
      ),
    )
    .map((event) => calendarEventView(event, users, branches));
  res.json({
    events: visibleEvents,
    notifications: calendarNotificationsFor(visibleEvents),
  });
});

app.post(
  "/api/calendar/events",
  requireAuth,
  requireRoles("super_admin", "branch_admin"),
  (req, res) => {
    const title = String(req.body.title || "").trim();
    const type = String(req.body.type || "");
    const startDate = String(req.body.startDate || "").trim();
    const endDate = String(req.body.endDate || startDate).trim();
    const startTime = String(req.body.startTime || "").trim();
    const description = String(req.body.description || "").trim();
    const branchId = req.body.branchId || null;
    const employeeId = req.body.employeeId || null;
    const studentId = req.body.studentId || null;
    if (!title || !startDate)
      return res
        .status(400)
        .json({ message: "Calendar title and start date are required." });
    if (!CALENDAR_TYPES.includes(type))
      return res
        .status(400)
        .json({ message: "Choose a valid calendar event type." });

    const users = readUsers();
    const branch = branchId
      ? readJson(FILES.branches, []).find((item) => item.id === branchId)
      : null;
    const employee = employeeId
      ? users.find((item) => item.id === employeeId)
      : null;
    const student = studentId
      ? users.find((item) => item.id === studentId)
      : null;
    if (type === "branch_holiday" && !branchId)
      return res
        .status(400)
        .json({ message: "Select a branch for branch-wise holidays." });
    if (type === "employee_event" && !employeeId)
      return res
        .status(400)
        .json({ message: "Select an employee for employee events." });
    if (type === "student_event" && !studentId)
      return res
        .status(400)
        .json({ message: "Select a student for student events." });
    if (branchId && !branch)
      return res
        .status(400)
        .json({ message: "Selected branch was not found." });
    if (employeeId && !employee)
      return res
        .status(400)
        .json({ message: "Selected employee was not found." });
    if (studentId && !student)
      return res
        .status(400)
        .json({ message: "Selected student was not found." });
    if (branchId && !canManageBranch(req.user, branchId))
      return res
        .status(403)
        .json({
          message: "You cannot manage calendar items outside your branch.",
        });
    if (employee?.branchId && !canManageBranch(req.user, employee.branchId))
      return res
        .status(403)
        .json({
          message: "You cannot manage employee events outside your branch.",
        });
    if (student?.branchId && !canManageBranch(req.user, student.branchId))
      return res
        .status(403)
        .json({
          message: "You cannot manage student events outside your branch.",
        });

    const scope = [
      "company_holiday",
      "meeting_reminder",
      "training_schedule",
      "exam_schedule",
    ].includes(type)
      ? "company"
      : type === "branch_holiday"
        ? "branch"
        : type === "student_event"
          ? "student"
          : "employee";
    const events = readJson(FILES.calendarEvents, []);
    const event = {
      id: randomUUID(),
      title,
      type,
      scope,
      branchId:
        scope === "branch"
          ? branchId
          : employee?.branchId || student?.branchId || branchId || null,
      employeeId: scope === "employee" ? employeeId : null,
      studentId: scope === "student" ? studentId : null,
      startDate,
      endDate,
      startTime,
      description,
      createdBy: req.user.id,
      createdAt: new Date().toISOString(),
    };
    events.push(event);
    writeJson(FILES.calendarEvents, events);
    res
      .status(201)
      .json({
        event: calendarEventView(event, users, readJson(FILES.branches, [])),
      });
  },
);

app.delete(
  "/api/calendar/events/:id",
  requireAuth,
  requireRoles("super_admin", "branch_admin"),
  (req, res) => {
    const events = readJson(FILES.calendarEvents, []);
    const event = events.find((item) => item.id === req.params.id);
    if (!event)
      return res.status(404).json({ message: "Calendar event not found." });
    if (event.branchId && !canManageBranch(req.user, event.branchId))
      return res
        .status(403)
        .json({
          message: "You cannot delete calendar items outside your branch.",
        });
    const nextEvents = events.filter((item) => item.id !== req.params.id);
    writeJson(FILES.calendarEvents, nextEvents);
    res.json({
      events: nextEvents.filter((item) => canSeeCalendarEvent(req.user, item)),
    });
  },
);

app.get(
  "/api/reports/monthly",
  requireAuth,
  requireRoles("super_admin", "branch_admin"),
  (req, res) => {
    const month = String(req.query.month || monthKey()).slice(0, 7);
    res.json({ report: monthlyReportFor(req.user, month) });
  },
);

app.get(
  "/api/reports/monthly/export",
  requireAuth,
  requireRoles("super_admin", "branch_admin"),
  (req, res) => {
    const month = String(req.query.month || monthKey()).slice(0, 7);
    const format = String(req.query.format || "excel");
    const report = monthlyReportFor(req.user, month);
    if (format === "pdf") {
      const lines = [
        `Month: ${report.month}`,
        `Employees: ${report.totals.employees}`,
        `Students: ${report.totals.students}`,
        `Attendance records: ${report.totals.attendanceRecords}`,
        `Completed tasks: ${report.totals.completedTasks}/${report.totals.assignedTasks}`,
        `Leave requests: ${report.totals.leaveRequests}`,
        `Payroll processed: ${report.totals.payrollProcessed}`,
        ...report.rows.map(
          (row) =>
            `${row.employeeName}: ${row.attendanceDays} days, ${row.completedTasks}/${row.totalTasks} tasks, ${row.completionRate}%`,
        ),
      ].slice(0, 34);
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="monthly-report-${month}.pdf"`,
      );
      return res.send(
        monthlyAttendanceReportSample() ||
          simplePdf("Monthly Employee Report", lines),
      );
    }
    res.setHeader("Content-Type", "application/vnd.ms-excel");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="monthly-report-${month}.csv"`,
    );
    res.send(monthlyReportCsv(report));
  },
);

app.get(
  "/api/payroll",
  requireAuth,
  requireRoles("super_admin", "branch_admin", "employee", "student"),
  (req, res) => {
    const month = String(req.query.month || monthKey()).slice(0, 7);
    const users = scopedUsersFor(req.user).filter((user) =>
      STAFF_ROLES.includes(normalizeRole(user.role)),
    );
    const userIds = new Set(users.map((user) => user.id));
    const payroll = readJson(FILES.payroll, []).filter(
      (row) => row.month === month && userIds.has(row.userId),
    );
    const slips = readJson(FILES.salarySlips, []);
    res.json({
      payroll: payroll.map((row) => ({
        ...row,
        employeeName:
          users.find((user) => user.id === row.userId)?.name || "Unknown",
        employeeId:
          users.find((user) => user.id === row.userId)?.employeeId ||
          row.userId,
        slipId: slips.find((slip) => slip.payrollId === row.id)?.id || null,
      })),
    });
  },
);

app.post(
  "/api/payroll/process",
  requireAuth,
  requireRoles("super_admin", "branch_admin"),
  (req, res) => {
    const month = String(req.body.month || monthKey()).slice(0, 7);
    const targetUserIds = Array.isArray(req.body.userIds)
      ? req.body.userIds
      : [];
    const users = scopedUsersFor(req.user).filter((user) =>
      STAFF_ROLES.includes(normalizeRole(user.role)),
    );
    const selected = targetUserIds.length
      ? users.filter((user) => targetUserIds.includes(user.id))
      : users;
    const payroll = readJson(FILES.payroll, []);
    const slips = readJson(FILES.salarySlips, []);
    for (const user of selected) {
      const basicSalary = Number(
        req.body.basicSalary ?? req.body.salary ?? user.salary ?? 0,
      );
      const hra = Math.round(basicSalary * 0.4);
      const incentivePay = Number(req.body.incentivePay ?? 0);
      const bonus = Number(req.body.bonus ?? req.body.bonuses ?? 0);
      const specialAllowance = Number(req.body.specialAllowance ?? 0);
      const otherEarnings = Number(req.body.otherEarnings ?? 0);
      const grossSalary =
        basicSalary +
        hra +
        incentivePay +
        bonus +
        specialAllowance +
        otherEarnings;
      const providentFund = Math.round(basicSalary * 0.12);
      const esi = grossSalary <= 21000 ? Math.round(grossSalary * 0.0075) : 0;
      const professionalTax = Number(req.body.professionalTax ?? 0);
      const salaryAdvance = Number(req.body.salaryAdvance ?? 0);
      const loan = Number(req.body.loan ?? 0);
      const otherDeductions = Number(req.body.otherDeductions ?? 0);
      const totalDeductions =
        providentFund +
        esi +
        professionalTax +
        salaryAdvance +
        loan +
        otherDeductions;
      const netPay = grossSalary - totalDeductions;
      let row = payroll.find(
        (item) => item.userId === user.id && item.month === month,
      );
      if (!row) {
        row = {
          id: randomUUID(),
          userId: user.id,
          branchId: user.branchId,
          month,
          createdAt: new Date().toISOString(),
        };
        payroll.push(row);
      }
      Object.assign(row, {
        salary: basicSalary,
        basicSalary,
        hra,
        incentivePay,
        bonus,
        bonuses: bonus,
        specialAllowance,
        otherEarnings,
        grossSalary,
        providentFund,
        esi,
        professionalTax,
        salaryAdvance,
        loan,
        otherDeductions,
        deductions: totalDeductions,
        totalDeductions,
        netPay,
        processedBy: req.user.id,
        processedAt: new Date().toISOString(),
      });
      if (!slips.some((slip) => slip.payrollId === row.id)) {
        slips.push({
          id: randomUUID(),
          payrollId: row.id,
          userId: user.id,
          month,
          generatedAt: new Date().toISOString(),
        });
      }
    }
    writeJson(FILES.payroll, payroll);
    writeJson(FILES.salarySlips, slips);
    res.status(201).json({ processed: selected.length });
  },
);

app.get(
  "/api/payroll/:id/payslip",
  requireAuth,
  requireRoles("super_admin", "branch_admin", "employee"),
  async (req, res, next) => {
    const sendPayslip = ({ row, user, branch }) => {
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="payslip-${row.month}-${user?.employeeId || row.userId}.pdf"`,
      );
      res.send(modernPayslipPdf({ row, user, branch }));
    };

    const payroll = readJson(FILES.payroll, []);
    const row = payroll.find((item) => item.id === req.params.id);
    if (row) {
      if (
        row.userId !== req.user.id &&
        !canManageBranch(req.user, row.branchId)
      )
        return res
          .status(403)
          .json({ message: "You cannot download this payslip." });
      const user = readUsers().find((item) => item.id === row.userId);
      const branch = readJson(FILES.branches, []).find(
        (item) => item.id === row.branchId,
      );
      return sendPayslip({ row, user, branch });
    }

    if (!isMongoConnected())
      return res.status(404).json({ message: "Payroll record not found." });

    try {
      const mongoPayroll = await MongoPayroll.findById(req.params.id).lean();
      if (!mongoPayroll)
        return res.status(404).json({ message: "Payroll record not found." });

      const normalizedRow = normalizeMongoPayrollRow(mongoPayroll);
      const [mongoUser, mongoBranch, currentMongoUser] = await Promise.all([
        normalizedRow.userId
          ? MongoUser.findById(normalizedRow.userId).lean()
          : null,
        normalizedRow.branchId
          ? MongoBranch.findById(normalizedRow.branchId).lean()
          : null,
        req.user.email
          ? MongoUser.findOne({
              email: String(req.user.email).toLowerCase(),
            }).lean()
          : null,
      ]);

      const role = normalizeRole(req.user.role);
      const currentMongoUserId = currentMongoUser?._id
        ? String(currentMongoUser._id)
        : "";
      const currentBranchId = currentMongoUser?.branchId
        ? String(currentMongoUser.branchId)
        : String(req.user.branchId || "");
      const canDownload =
        role === "super_admin" ||
        normalizedRow.userId === req.user.id ||
        normalizedRow.userId === currentMongoUserId ||
        (role === "branch_admin" &&
          normalizedRow.branchId &&
          normalizedRow.branchId === currentBranchId);
      if (!canDownload)
        return res
          .status(403)
          .json({ message: "You cannot download this payslip." });

      return sendPayslip({
        row: normalizedRow,
        user: mongoUser,
        branch: mongoBranch,
      });
    } catch (error) {
      if (error?.name === "CastError")
        return res.status(404).json({ message: "Payroll record not found." });
      return next(error);
    }
  },
);

app.get("/api/attendance-regularization", requireAuth, (req, res) => {
  const users = scopedUsersFor(req.user);
  const userIds = new Set(users.map((user) => user.id));
  const requests = readJson(FILES.attendanceRegularization, []);
  const visible = ["employee", "student"].includes(normalizeRole(req.user.role))
    ? requests.filter((request) => request.userId === req.user.id)
    : requests.filter((request) => userIds.has(request.userId));
  res.json({
    requests: visible.map((request) => ({
      ...request,
      userName:
        users.find((user) => user.id === request.userId)?.name || "Unknown",
    })),
  });
});

app.post(
  "/api/attendance-regularization",
  requireAuth,
  requireRoles("employee", "branch_admin"),
  (req, res) => {
    const type = String(req.body.type || "").trim();
    const date = String(req.body.date || "").trim();
    const reason = String(req.body.reason || "").trim();
    if (
      !["correction", "missing_attendance", "shift_adjustment"].includes(type)
    )
      return res
        .status(400)
        .json({ message: "Choose a valid regularization type." });
    if (!date || !reason)
      return res.status(400).json({ message: "Date and reason are required." });
    const requests = readJson(FILES.attendanceRegularization, []);
    const request = {
      id: randomUUID(),
      userId: req.user.id,
      branchId: req.user.branchId,
      type,
      date,
      requestedClockIn: req.body.requestedClockIn || "",
      requestedClockOut: req.body.requestedClockOut || "",
      reason,
      status: "pending_branch_admin",
      branchAdminDecisionBy: null,
      adminDecisionBy: null,
      createdAt: new Date().toISOString(),
    };
    requests.push(request);
    writeJson(FILES.attendanceRegularization, requests);
    res.status(201).json({ request });
  },
);

app.put(
  "/api/attendance-regularization/:id/status",
  requireAuth,
  requireRoles("super_admin", "branch_admin"),
  (req, res) => {
    const decision = String(req.body.decision || "");
    const requests = readJson(FILES.attendanceRegularization, []);
    const request = requests.find((item) => item.id === req.params.id);
    if (!request)
      return res
        .status(404)
        .json({ message: "Regularization request not found." });
    if (!canManageBranch(req.user, request.branchId))
      return res
        .status(403)
        .json({ message: "You cannot manage this request." });
    if (!["approved", "rejected"].includes(decision))
      return res
        .status(400)
        .json({ message: "Decision must be approved or rejected." });
    if (normalizeRole(req.user.role) === "branch_admin") {
      request.status = decision === "approved" ? "pending_admin" : "rejected";
      request.branchAdminDecisionBy = req.user.id;
      request.branchAdminDecisionAt = new Date().toISOString();
    } else {
      request.status = decision;
      request.adminDecisionBy = req.user.id;
      request.adminDecisionAt = new Date().toISOString();
    }
    writeJson(FILES.attendanceRegularization, requests);
    res.json({ request });
  },
);

app.get("/api/notifications", requireAuth, (req, res) => {
  const users = scopedUsersFor(req.user);
  const birthdays = birthdayEventsFor(users)
    .filter((event) => event.startDate === todayKey())
    .map((event) => ({
      id: event.id,
      type: "birthday",
      title: event.title,
      message: event.description,
      createdAt: new Date().toISOString(),
    }));
  const notifications = readJson(FILES.notifications, []).filter(
    (item) =>
      !item.userId ||
      item.userId === req.user.id ||
      canManageBranch(req.user, item.branchId),
  );
  res.json({ notifications: [...birthdays, ...notifications].slice(0, 12) });
});

app.get("/api/sessions", requireAuth, (req, res) => {
  const sessions = readJson(FILES.sessions, []);
  const scoped =
    normalizeRole(req.user.role) === "super_admin"
      ? sessions
      : sessions.filter((session) => session.userId === req.user.id);
  res.json({ sessions: scoped });
});

registerFaceAttendanceRoutes(app, { requireAuth });
registerStudentPortalRoutes(app, { requireAuth });
registerProductionFeatureRoutes(app, { requireAuth, createToken });
registerMongoCrudRoutes(app, { requireAuth });

app.use((error, _req, res, next) => {
  if (!error) return next();
  if (error.name === "ValidationError") {
    return res.status(400).json({
      message: Object.values(error.errors)
        .map((item) => item.message)
        .join(" "),
    });
  }
  if (error.code === 11000) {
    return res
      .status(409)
      .json({
        message: "Duplicate record.",
        fields: Object.keys(error.keyPattern || {}),
      });
  }
  console.error(error);
  return res.status(500).json({ message: "Server error." });
});

async function startServer() {
  ensureDatabase();
  try {
    const connection = await connectDB();
    if (connection) await seedMongoData();
  } catch (error) {
    console.error("MongoDB startup failed:", error.message);
  }

  if (USE_HTTPS && existsSync(HTTPS_KEY_PATH) && existsSync(HTTPS_CERT_PATH)) {
    createHttpsServer(
      {
        key: readFileSync(HTTPS_KEY_PATH),
        cert: readFileSync(HTTPS_CERT_PATH),
      },
      app,
    ).listen(PORT, () => {
      console.log(`AuthFlow RBAC API running on https://localhost:${PORT}`);
    });
    app.listen(INTERNAL_HTTP_PORT, "127.0.0.1", () => {
      console.log(
        `AuthFlow internal API proxy running on http://127.0.0.1:${INTERNAL_HTTP_PORT}`,
      );
    });
  } else {
    app.listen(PORT, () => {
      console.log(`AuthFlow RBAC API running on http://localhost:${PORT}`);
    });
  }
}

let runtimeReady;

export async function initializeRuntime() {
  if (!runtimeReady) {
    runtimeReady = (async () => {
      ensureDatabase();
      try {
        const connection = await connectDB();
        if (connection) await seedMongoData();
      } catch (error) {
        console.error("MongoDB startup failed:", error.message);
      }
    })();
  }
  return runtimeReady;
}

function monthlyAttendanceReportSample() {
  return existsSync(MONTHLY_ATTENDANCE_REPORT_PDF)
    ? readFileSync(MONTHLY_ATTENDANCE_REPORT_PDF)
    : null;
}

startServer();

export default app;
