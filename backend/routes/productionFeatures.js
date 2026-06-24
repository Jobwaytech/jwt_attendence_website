import bcrypt from "bcryptjs";
import { createHash, randomBytes } from "node:crypto";
import { isMongoConnected } from "../config/db.js";
import {
  Attendance,
  AttendanceRegularization,
  AuditLog,
  Branch,
  Calendar,
  FaceProfile,
  FileAsset,
  Leave,
  LoginHistory,
  Payroll,
  RefreshToken,
  Report,
  Task,
  User,
} from "../models/index.js";
import { storeFile } from "../services/storage.js";

const MANAGER_ROLES = ["super_admin", "branch_admin"];
const REPORT_TYPES = [
  "employee-attendance",
  "student-attendance",
  "leave",
  "task",
  "payroll",
  "branch-performance",
  "reports",
];

function mongoReady(_req, res, next) {
  if (!isMongoConnected())
    return res.status(503).json({
      message:
        "MongoDB is not connected. Set MONGODB_URI and restart the server.",
    });
  next();
}

function canManage(req) {
  return MANAGER_ROLES.includes(req.user?.role);
}

function ip(req) {
  return String(
    req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "",
  )
    .split(",")[0]
    .trim();
}

async function mongoUser(req) {
  return User.findOne({ email: req.user.email.toLowerCase() });
}

async function audit(req, action, resource, metadata = {}) {
  const user = await mongoUser(req).catch(() => null);
  return AuditLog.create({
    userId: user?._id || null,
    action,
    resource,
    role: req.user?.role,
    ipAddress: ip(req),
    userAgent: req.headers["user-agent"] || "",
    metadata,
  }).catch(() => null);
}

function monthKey(value) {
  return String(value || "").slice(0, 7) || "unknown";
}

function groupCount(items, keyFn) {
  return items.reduce((map, item) => {
    const key = keyFn(item);
    map[key] = (map[key] || 0) + 1;
    return map;
  }, {});
}

function rowsToCsv(rows) {
  return rows
    .map((row) =>
      row
        .map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`)
        .join(","),
    )
    .join("\n");
}

function simplePdf(title, rows) {
  const lines = [
    "JOB WAY TECH CONSULTANT & TRAINING",
    title,
    ...rows.map((row) => row.join(" | ")),
  ].slice(0, 55);
  const escaped = lines.map((line) => String(line).replace(/[()\\]/g, "\\$&"));
  const content = `BT /F1 14 Tf 40 800 Td (${escaped[0] || ""}) Tj ${escaped
    .slice(1)
    .map((line) => `0 -18 Td (${line}) Tj`)
    .join(" ")} ET`;
  const objects = [
    "1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj",
    "2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj",
    "3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >> endobj",
    "4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj",
    `5 0 obj << /Length ${Buffer.byteLength(content)} >> stream\n${content}\nendstream endobj`,
  ];
  let body = "%PDF-1.4\n";
  const offsets = [0];
  for (const object of objects) {
    offsets.push(Buffer.byteLength(body));
    body += `${object}\n`;
  }
  const xref = Buffer.byteLength(body);
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets
    .slice(1)
    .map((offset) => `${String(offset).padStart(10, "0")} 00000 n `)
    .join("\n")}\n`;
  body += `trailer << /Root 1 0 R /Size ${objects.length + 1} >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(body);
}

async function reportData(type, query = {}) {
  const [users, branches, attendance, leaves, tasks, payroll] =
    await Promise.all([
      User.find().lean(),
      Branch.find().lean(),
      Attendance.find().lean(),
      Leave.find().lean(),
      Task.find().lean(),
      Payroll.find().lean(),
    ]);
  const userName = (id) =>
    users.find((user) => String(user._id) === String(id))?.name || "Unassigned";
  const branchName = (id) =>
    branches.find((branch) => String(branch._id) === String(id))?.name ||
    "No branch";

  if (type === "employee-attendance" || type === "student-attendance") {
    const role = type === "student-attendance" ? "student" : "employee";
    const roleUsers = users.filter((user) =>
      role === "employee"
        ? ["employee", "branch_admin"].includes(user.role)
        : user.role === "student",
    );
    const rows = attendance
      .filter((item) =>
        roleUsers.some((user) => String(user._id) === String(item.userId)),
      )
      .map((item) => [
        userName(item.userId),
        item.date,
        item.clockInAt || "",
        item.clockOutAt || "",
        item.status || "present",
        item.matchScore || 0,
        item.gpsVerified ? "GPS Verified" : "GPS Pending",
      ]);
    return {
      title:
        role === "student"
          ? "Student Attendance Report"
          : "Employee Attendance Report",
      headers: [
        "Name",
        "Date",
        "Clock In",
        "Clock Out",
        "Status",
        "Face Score",
        "GPS",
      ],
      rows,
    };
  }
  if (type === "leave")
    return {
      title: "Leave Report",
      headers: ["Name", "Type", "From", "To", "Reason", "Status"],
      rows: leaves.map((item) => [
        userName(item.userId),
        item.leaveType,
        item.fromDate,
        item.toDate,
        item.reason,
        item.status,
      ]),
    };
  if (type === "task")
    return {
      title: "Task Completion Report",
      headers: [
        "Title",
        "Assignee",
        "Priority",
        "Deadline",
        "Status",
        "Progress",
      ],
      rows: tasks.flatMap((task) =>
        (task.assignments || []).map((item) => [
          task.title,
          userName(item.userId),
          task.priority,
          task.deadline,
          item.status,
          item.progress || 0,
        ]),
      ),
    };
  if (type === "payroll")
    return {
      title: "Payroll Report",
      headers: ["Name", "Month", "Salary", "Deductions", "Net Pay"],
      rows: payroll.map((item) => [
        userName(item.userId),
        item.month,
        item.salary || 0,
        item.totalDeductions || 0,
        item.netPay || 0,
      ]),
    };
  const rows = branches.map((branch) => {
    const branchUsers = users.filter(
      (user) => String(user.branchId) === String(branch._id),
    );
    return [
      branch.name,
      branchUsers.filter((user) => user.role !== "student").length,
      branchUsers.filter((user) => user.role === "student").length,
      attendance.filter((item) => String(item.branchId) === String(branch._id))
        .length,
      leaves.filter(
        (item) =>
          String(item.branchId) === String(branch._id) &&
          item.status === "pending",
      ).length,
    ];
  });
  return {
    title: "Branch Performance Report",
    headers: [
      "Branch",
      "Employees",
      "Students",
      "Attendance",
      "Pending Leaves",
    ],
    rows,
  };
}

export function registerProductionFeatureRoutes(
  app,
  { requireAuth, createToken },
) {
  app.get(
    "/api/analytics/dashboard",
    requireAuth,
    mongoReady,
    async (req, res, next) => {
      try {
        if (!canManage(req))
          return res.status(403).json({ message: "Manager access required." });
        const [users, branches, attendance, leaves, tasks, payroll] =
          await Promise.all([
            User.find().lean(),
            Branch.find().lean(),
            Attendance.find().lean(),
            Leave.find().lean(),
            Task.find().lean(),
            Payroll.find().lean(),
          ]);
        const taskAssignments = tasks.flatMap((task) => task.assignments || []);
        res.json({
          cards: {
            totalEmployees: users.filter((user) =>
              ["employee", "branch_admin"].includes(user.role),
            ).length,
            totalStudents: users.filter((user) => user.role === "student")
              .length,
            totalBranches: branches.length,
            totalAttendance: attendance.length,
            totalLeaves: leaves.length,
            totalTasks: taskAssignments.length,
            totalPayroll: payroll.length,
          },
          charts: {
            attendanceTrend: groupCount(attendance, (item) =>
              monthKey(item.date),
            ),
            payrollTrend: payroll.reduce(
              (map, item) => ({
                ...map,
                [item.month]: (map[item.month] || 0) + Number(item.netPay || 0),
              }),
              {},
            ),
            leaveTrend: groupCount(leaves, (item) => monthKey(item.fromDate)),
            taskCompletionTrend: groupCount(
              taskAssignments.filter((item) => item.status === "completed"),
              (item) => monthKey(item.updatedAt || new Date()),
            ),
            branchPerformance: branches.map((branch) => ({
              branch: branch.name,
              attendance: attendance.filter(
                (item) => String(item.branchId) === String(branch._id),
              ).length,
              employees: users.filter(
                (user) => String(user.branchId) === String(branch._id),
              ).length,
            })),
          },
        });
      } catch (error) {
        next(error);
      }
    },
  );

  app.get(
    "/api/reports/:type",
    requireAuth,
    mongoReady,
    async (req, res, next) => {
      try {
        if (!canManage(req))
          return res.status(403).json({ message: "Manager access required." });
        const type = REPORT_TYPES.includes(req.params.type)
          ? req.params.type
          : "branch-performance";
        const data = await reportData(type, req.query);
        await audit(req, "report_view", type);
        res.json(data);
      } catch (error) {
        next(error);
      }
    },
  );

  app.get(
    "/api/exports/:type/:format",
    requireAuth,
    mongoReady,
    async (req, res, next) => {
      try {
        if (!canManage(req))
          return res.status(403).json({ message: "Manager access required." });
        const type = REPORT_TYPES.includes(req.params.type)
          ? req.params.type
          : "branch-performance";
        const data = await reportData(type, req.query);
        const rows = [data.headers, ...data.rows];
        await audit(req, "report_export", type, { format: req.params.format });
        if (req.params.format === "pdf") {
          res.setHeader("Content-Type", "application/pdf");
          res.setHeader(
            "Content-Disposition",
            `attachment; filename=${type}-report.pdf`,
          );
          return res.send(simplePdf(data.title, rows));
        }
        res.setHeader("Content-Type", "text/csv");
        res.setHeader(
          "Content-Disposition",
          `attachment; filename=${type}-report.csv`,
        );
        return res.send(rowsToCsv(rows));
      } catch (error) {
        next(error);
      }
    },
  );

  app.put(
    "/api/regularizations/:id/branch-decision",
    requireAuth,
    mongoReady,
    async (req, res, next) => {
      try {
        if (!canManage(req))
          return res.status(403).json({ message: "Manager access required." });
        const reviewer = await mongoUser(req);
        const status =
          req.body.decision === "rejected" ? "rejected" : "pending";
        const item = await AttendanceRegularization.findByIdAndUpdate(
          req.params.id,
          {
            status,
            branchAdminDecisionBy: reviewer?._id,
            branchAdminDecisionAt: new Date(),
            remarks: req.body.remarks || "",
          },
          { returnDocument: 'after', runValidators: true },
        );
        if (!item)
          return res
            .status(404)
            .json({ message: "Regularization request not found." });
        await audit(
          req,
          "regularization_branch_decision",
          "attendance_regularizations",
          { id: req.params.id, status },
        );
        res.json({ item });
      } catch (error) {
        next(error);
      }
    },
  );

  app.put(
    "/api/regularizations/:id/super-decision",
    requireAuth,
    mongoReady,
    async (req, res, next) => {
      try {
        if (req.user?.role !== "super_admin")
          return res
            .status(403)
            .json({ message: "Super Admin access required." });
        const reviewer = await mongoUser(req);
        const status =
          req.body.decision === "rejected" ? "rejected" : "approved";
        const item = await AttendanceRegularization.findByIdAndUpdate(
          req.params.id,
          {
            status,
            superAdminDecisionBy: reviewer?._id,
            superAdminDecisionAt: new Date(),
            remarks: req.body.remarks || "",
          },
          { returnDocument: 'after', runValidators: true },
        );
        if (!item)
          return res
            .status(404)
            .json({ message: "Regularization request not found." });
        await audit(
          req,
          "regularization_super_decision",
          "attendance_regularizations",
          { id: req.params.id, status },
        );
        res.json({ item });
      } catch (error) {
        next(error);
      }
    },
  );

  app.post(
    "/api/files/upload",
    requireAuth,
    mongoReady,
    async (req, res, next) => {
      try {
        const owner = req.body.ownerId
          ? await User.findById(req.body.ownerId)
          : await mongoUser(req);
        if (!owner)
          return res.status(404).json({ message: "File owner not found." });
        const stored = await storeFile({
          dataUrl: req.body.dataUrl,
          category: req.body.category,
          originalName: req.body.originalName,
        });
        const item = await FileAsset.create({
          ownerId: owner._id,
          branchId: owner.branchId || null,
          category: req.body.category,
          originalName:
            req.body.originalName || stored.originalName || "upload",
          mimeType:
            req.body.mimeType || stored.mimeType || "application/octet-stream",
          size: stored.size || 0,
          provider: stored.provider,
          url: stored.url,
          publicId: stored.publicId,
          uploadedBy: (await mongoUser(req))?._id || null,
        });
        await audit(req, "file_upload", req.body.category, {
          ownerId: String(owner._id),
        });
        res.status(201).json({ item });
      } catch (error) {
        next(error);
      }
    },
  );

  app.get(
    "/api/security/login-history",
    requireAuth,
    mongoReady,
    async (req, res, next) => {
      try {
        if (!canManage(req))
          return res.status(403).json({ message: "Manager access required." });
        res.json({
          loginHistory: await LoginHistory.find()
            .sort("-createdAt")
            .limit(200)
            .lean(),
        });
      } catch (error) {
        next(error);
      }
    },
  );

  app.get(
    "/api/security/audit-logs",
    requireAuth,
    mongoReady,
    async (req, res, next) => {
      try {
        if (!canManage(req))
          return res.status(403).json({ message: "Manager access required." });
        res.json({
          auditLogs: await AuditLog.find().sort("-createdAt").limit(200).lean(),
        });
      } catch (error) {
        next(error);
      }
    },
  );

  app.post("/api/auth/refresh", mongoReady, async (req, res, next) => {
    try {
      const token = String(req.body.refreshToken || "");
      const tokenHash = createHash("sha256").update(token).digest("hex");
      const stored = await RefreshToken.findOne({
        tokenHash,
        revokedAt: null,
        expiresAt: { $gt: new Date() },
      });
      if (!stored)
        return res
          .status(401)
          .json({ message: "Refresh token is invalid or expired." });
      const user = await User.findById(stored.userId).lean();
      if (!user)
        return res
          .status(401)
          .json({ message: "Refresh token user no longer exists." });
      res.json({ token: createToken({ ...user, id: String(user._id) }) });
    } catch (error) {
      next(error);
    }
  });

  app.post(
    "/api/security/refresh-token",
    requireAuth,
    mongoReady,
    async (req, res, next) => {
      try {
        const user = await mongoUser(req);
        if (!user) return res.status(404).json({ message: "User not found." });
        const refreshToken = randomBytes(48).toString("hex");
        await RefreshToken.create({
          userId: user._id,
          tokenHash: createHash("sha256").update(refreshToken).digest("hex"),
          sessionId: req.sessionId,
          expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30),
          ipAddress: ip(req),
          userAgent: req.headers["user-agent"] || "",
        });
        res.status(201).json({ refreshToken });
      } catch (error) {
        next(error);
      }
    },
  );

  app.post(
    "/api/security/password-reset",
    mongoReady,
    async (req, res, next) => {
      try {
        const email = String(req.body.email || "").toLowerCase();
        const password = String(req.body.password || "");
        if (password.length < 6)
          return res
            .status(400)
            .json({ message: "Password must be at least 6 characters." });
        await User.findOneAndUpdate(
          { email },
          { passwordHash: bcrypt.hashSync(password, 10) },
        );
        await LoginHistory.create({
          email,
          status: "success",
          message: "Password reset completed.",
        });
        res.json({ message: "Password reset completed." });
      } catch (error) {
        next(error);
      }
    },
  );
}
