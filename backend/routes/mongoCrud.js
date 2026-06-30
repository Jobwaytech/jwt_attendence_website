import mongoose from "mongoose";
import {
  Attendance,
  AttendanceRegularization,
  Branch,
  Calendar,
  Leave,
  Payroll,
  Report,
  Task,
  User,
} from "../models/index.js";
import { isMongoConnected } from "../config/db.js";
import bcrypt from "bcryptjs";

const resources = {
  users: { Model: User, listKey: "users", managerOnly: true },
  branches: { Model: Branch, listKey: "branches", managerOnly: true },
  attendance: {
    Model: Attendance,
    listKey: "attendances",
    writeRoles: ["super_admin", "branch_admin", "employee", "student"],
  },
  attendances: {
    Model: Attendance,
    listKey: "attendances",
    writeRoles: ["super_admin", "branch_admin", "employee", "student"],
  },
  attendance_regularizations: {
    Model: AttendanceRegularization,
    listKey: "regularizations",
    writeRoles: ["super_admin", "branch_admin", "employee", "student"],
  },
  leaves: {
    Model: Leave,
    listKey: "leaves",
    writeRoles: ["super_admin", "branch_admin", "employee", "student"],
  },
  tasks: {
    Model: Task,
    listKey: "tasks",
    writeRoles: ["super_admin", "branch_admin"],
  },
  payroll: {
    Model: Payroll,
    listKey: "payrolls",
    writeRoles: ["super_admin", "branch_admin"],
  },
  payrolls: {
    Model: Payroll,
    listKey: "payrolls",
    writeRoles: ["super_admin", "branch_admin"],
  },
  calendar: {
    Model: Calendar,
    listKey: "calendars",
    writeRoles: ["super_admin", "branch_admin"],
  },
  calendars: {
    Model: Calendar,
    listKey: "calendars",
    writeRoles: ["super_admin", "branch_admin"],
  },
  reports: { Model: Report, listKey: "reports", managerOnly: true },
};

function mongoReady(_req, res, next) {
  if (!isMongoConnected())
    return res
      .status(503)
      .json({
        message:
          "MongoDB is not connected. Set MONGODB_URI and restart the server.",
      });
  next();
}

function resourceFor(req, res, next) {
  const resource = resources[req.params.resource];
  if (!resource)
    return res.status(404).json({ message: "Unknown MongoDB resource." });
  resource.key = req.params.resource;
  req.mongoResource = resource;
  next();
}

function canUseResource(req, res, next) {
  const role = req.user?.role;
  const resource = req.mongoResource;
  const writeMethod = ["POST", "PUT", "PATCH", "DELETE"].includes(req.method);

  if (role === "super_admin") return next();
  if (
    resource.managerOnly &&
    !["branch_admin"].includes(role) &&
    (writeMethod || !["users", "branches"].includes(resource.key))
  ) {
    return res
      .status(403)
      .json({ message: "You do not have access to this resource." });
  }
  if (
    writeMethod &&
    !(resource.writeRoles || ["super_admin", "branch_admin"]).includes(role)
  )
    return res
      .status(403)
      .json({
        message: "You do not have permission to modify this MongoDB resource.",
      });
  return next();
}

function parseQuery(query) {
  const filter = {};
  for (const [key, value] of Object.entries(query)) {
    if (
      ["limit", "page", "sort", "populate"].includes(key) ||
      value === undefined ||
      value === ""
    )
      continue;
    filter[key] = mongoose.isValidObjectId(value) ? value : value;
  }
  return filter;
}

async function currentMongoUser(req) {
  if (!req.user?.email) return null;
  return User.findOne({ email: String(req.user.email).toLowerCase() }).lean();
}

function emptyFilter() {
  return { _id: { $exists: false } };
}

async function scopedReadFilter(req, baseFilter) {
  const role = req.user?.role;
  const key = req.mongoResource.key;
  if (role === "super_admin") return baseFilter;

  const user = await currentMongoUser(req);
  const userId = user?._id;
  const branchId = user?.branchId || req.user?.branchId || null;

  if (["users"].includes(key)) {
    if (role === "branch_admin")
      return branchId ? { ...baseFilter, branchId } : emptyFilter();
    return userId ? { ...baseFilter, _id: userId } : emptyFilter();
  }

  if (["branches"].includes(key)) {
    return branchId ? { ...baseFilter, _id: branchId } : emptyFilter();
  }

  if (["payroll", "payrolls"].includes(key)) {
    if (role === "student") return emptyFilter();
    if (role === "branch_admin")
      return branchId ? { ...baseFilter, branchId } : emptyFilter();
    return userId ? { ...baseFilter, userId } : emptyFilter();
  }

  return baseFilter;
}

export function registerMongoCrudRoutes(app, { requireAuth }) {
  app.get("/api/mongodb/health", mongoReady, (_req, res) => {
    res.json({ ok: true, database: mongoose.connection.name });
  });

  app.get(
    "/api/mongodb/:resource",
    requireAuth,
    mongoReady,
    resourceFor,
    canUseResource,
    async (req, res, next) => {
      try {
        const { Model, listKey } = req.mongoResource;
        const limit = Math.min(Number(req.query.limit || 100), 500);
        const page = Math.max(Number(req.query.page || 1), 1);
        const sort = String(req.query.sort || "-createdAt");
        const filter = await scopedReadFilter(req, parseQuery(req.query));
        const [items, total] = await Promise.all([
          Model.find(filter)
            .sort(sort)
            .skip((page - 1) * limit)
            .limit(limit)
            .lean(),
          Model.countDocuments(filter),
        ]);
        res.json({ [listKey]: items, total, page, limit });
      } catch (error) {
        next(error);
      }
    },
  );

  app.get(
    "/api/mongodb/:resource/:id",
    requireAuth,
    mongoReady,
    resourceFor,
    canUseResource,
    async (req, res, next) => {
      try {
        const filter = await scopedReadFilter(req, { _id: req.params.id });
        const item = await req.mongoResource.Model.findOne(filter).lean();
        if (!item)
          return res.status(404).json({ message: "Record not found." });
        res.json({ item });
      } catch (error) {
        next(error);
      }
    },
  );

  app.post(
    "/api/mongodb/:resource",
    requireAuth,
    mongoReady,
    resourceFor,
    canUseResource,
    async (req, res, next) => {
      try {
        const body = { ...req.body };
        if (req.mongoResource.key === "users") {
          const plainPassword = String(
            body.password || body.passwordHash || "",
          );
          if (plainPassword && !plainPassword.startsWith("$2")) {
            body.passwordHash = await bcrypt.hash(plainPassword, 10);
          }
          delete body.password;
        }
        const item = await req.mongoResource.Model.create(body);
        res.status(201).json({ item });
      } catch (error) {
        next(error);
      }
    },
  );

  app.put(
    "/api/mongodb/:resource/:id",
    requireAuth,
    mongoReady,
    resourceFor,
    canUseResource,
    async (req, res, next) => {
      try {
        const body = { ...req.body };
        if (req.mongoResource.key === "users") {
          const plainPassword = String(body.password || "");
          if (plainPassword) {
            if (req.user?.role !== "super_admin") {
              return res
                .status(403)
                .json({ message: "Only Super Admin can change passwords." });
            }
            body.passwordHash = await bcrypt.hash(plainPassword, 10);
          }
          delete body.password;
        }
        const item = await req.mongoResource.Model.findByIdAndUpdate(
          req.params.id,
          body,
          { returnDocument: "after", runValidators: true },
        );
        if (!item)
          return res.status(404).json({ message: "Record not found." });
        res.json({ item });
      } catch (error) {
        next(error);
      }
    },
  );

  app.delete(
    "/api/mongodb/:resource/:id",
    requireAuth,
    mongoReady,
    resourceFor,
    canUseResource,
    async (req, res, next) => {
      try {
        const item = await req.mongoResource.Model.findByIdAndDelete(
          req.params.id,
        );
        if (!item)
          return res.status(404).json({ message: "Record not found." });
        res.json({ ok: true });
      } catch (error) {
        next(error);
      }
    },
  );
}
