import mongoose from "mongoose";
import { isMongoConnected } from "../config/db.js";
import { Attendance, Branch, FaceProfile, User } from "../models/index.js";

const FACE_MATCH_THRESHOLD = Number(process.env.FACE_MATCH_THRESHOLD || 85);
const ATTENDANCE_RADIUS_METERS = Number(
  process.env.ATTENDANCE_LOCATION_RADIUS_METERS || 150,
);
const COMPANY_LATITUDE =
  process.env.COMPANY_LATITUDE === undefined
    ? null
    : Number(process.env.COMPANY_LATITUDE);
const COMPANY_LONGITUDE =
  process.env.COMPANY_LONGITUDE === undefined
    ? null
    : Number(process.env.COMPANY_LONGITUDE);

function mongoReady(_req, res, next) {
  if (!isMongoConnected())
    return res.status(503).json({
      message:
        "MongoDB is not connected. Set MONGODB_URI and restart the server.",
    });
  next();
}

function roleOf(req) {
  return req.user?.role || "employee";
}

function canManage(req) {
  return ["super_admin", "branch_admin"].includes(roleOf(req));
}

function normalizeVector(vector) {
  if (!Array.isArray(vector)) return [];
  return vector.map(Number).filter((value) => Number.isFinite(value));
}

function normalizeEmbeddings(body) {
  const source = Array.isArray(body.faceEmbeddings)
    ? body.faceEmbeddings
    : Array.isArray(body.embeddings)
      ? body.embeddings
      : [];
  return source
    .map((item, index) => ({
      label: item.label || item.pose || `sample-${index + 1}`,
      vector: normalizeVector(item.vector || item.embedding || item),
      capturedAt: item.capturedAt ? new Date(item.capturedAt) : new Date(),
    }))
    .filter((item) => item.vector.length >= 32)
    .slice(0, 10);
}

function cosineScore(a, b) {
  const size = Math.min(a.length, b.length);
  if (!size) return 0;
  let dot = 0;
  let magA = 0;
  let magB = 0;
  for (let index = 0; index < size; index += 1) {
    dot += a[index] * b[index];
    magA += a[index] ** 2;
    magB += b[index] ** 2;
  }
  if (!magA || !magB) return 0;
  return Math.max(
    0,
    Math.min(
      100,
      Math.round((dot / (Math.sqrt(magA) * Math.sqrt(magB)) + 1) * 50),
    ),
  );
}

function bestFaceScore(profile, embedding) {
  return Math.max(
    0,
    ...(profile.faceEmbeddings || []).map((item) =>
      cosineScore(item.vector, embedding),
    ),
  );
}

function toRadians(value) {
  return (value * Math.PI) / 180;
}

function distanceMeters(aLat, aLng, bLat, bLng) {
  if (![aLat, aLng, bLat, bLng].every(Number.isFinite)) return null;
  const radius = 6371000;
  const dLat = toRadians(bLat - aLat);
  const dLng = toRadians(bLng - aLng);
  const lat1 = toRadians(aLat);
  const lat2 = toRadians(bLat);
  const value =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return Math.round(
    radius * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value)),
  );
}

async function resolveMongoUser(req, requestedUserId) {
  if (requestedUserId && mongoose.isValidObjectId(requestedUserId)) {
    const requested = await User.findById(requestedUserId);
    if (requested && (canManage(req) || requested.email === req.user.email))
      return requested;
  }
  const user = await User.findOne({ email: req.user.email.toLowerCase() });
  if (!user)
    throw new Error("MongoDB user profile is not available for this session.");
  return user;
}

async function officePoint(user, gps = {}) {
  const branch = user.branchId
    ? await Branch.findById(user.branchId).lean()
    : null;
  const office = branch?.officeLocation || {};
  const branchLatitude = Number(office.latitude);
  const branchLongitude = Number(office.longitude);
  if (Number.isFinite(branchLatitude) && Number.isFinite(branchLongitude)) {
    return {
      latitude: branchLatitude,
      longitude: branchLongitude,
      radiusMeters: Number(
        office.allowedRadiusMeters || ATTENDANCE_RADIUS_METERS,
      ),
      configured: true,
    };
  }
  if (Number.isFinite(COMPANY_LATITUDE) && Number.isFinite(COMPANY_LONGITUDE)) {
    return {
      latitude: COMPANY_LATITUDE,
      longitude: COMPANY_LONGITUDE,
      radiusMeters: ATTENDANCE_RADIUS_METERS,
      configured: true,
    };
  }
  const currentLatitude = Number(gps.latitude);
  const currentLongitude = Number(gps.longitude);
  return {
    latitude: currentLatitude,
    longitude: currentLongitude,
    radiusMeters: ATTENDANCE_RADIUS_METERS,
    configured: false,
  };
}

function verificationFailureReason({
  verification,
  livenessVerified,
  gpsVerified,
  distance,
  radius,
}) {
  return [
    verification.faceVerified
      ? ""
      : `Face score ${verification.matchScore}% is below ${FACE_MATCH_THRESHOLD}%.`,
    livenessVerified ? "" : "Liveness check failed.",
    gpsVerified
      ? ""
      : distance === null
        ? "GPS location is unavailable."
        : `GPS is ${distance}m from office, outside ${radius}m radius.`,
  ]
    .filter(Boolean)
    .join(" ");
}

function clientIp(req) {
  return String(
    req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "",
  )
    .split(",")[0]
    .trim();
}

async function trustDevice(user, fingerprint, deviceInfo) {
  if (!fingerprint)
    return { trusted: false, warning: "Device fingerprint unavailable." };
  const devices = user.trustedDevices || [];
  const existing = devices.find((item) => item.fingerprint === fingerprint);
  if (existing) {
    existing.lastSeenAt = new Date();
    existing.deviceInfo = deviceInfo || existing.deviceInfo;
    await user.save();
    return { trusted: true, warning: "" };
  }
  devices.push({
    fingerprint,
    deviceInfo,
    firstSeenAt: new Date(),
    lastSeenAt: new Date(),
  });
  user.trustedDevices = devices;
  await user.save();
  return {
    trusted: false,
    warning: "New attendance device detected and logged.",
  };
}

async function verifyPayload(req, user) {
  const embedding = normalizeVector(
    req.body.embedding || req.body.faceEmbedding,
  );
  const profile = await FaceProfile.findOne({ userId: user._id }).lean();
  if (!profile)
    return {
      profile,
      faceVerified: false,
      matchScore: 0,
      message: "Face profile is not registered.",
    };
  const matchScore = bestFaceScore(profile, embedding);
  return {
    profile,
    faceVerified: matchScore >= FACE_MATCH_THRESHOLD,
    matchScore,
    message:
      matchScore >= FACE_MATCH_THRESHOLD
        ? "Face verified."
        : "Face verification failed.",
  };
}

export function registerFaceAttendanceRoutes(app, { requireAuth }) {
  app.post(
    "/api/face/register",
    requireAuth,
    mongoReady,
    async (req, res, next) => {
      try {
        const user = await resolveMongoUser(req, req.body.userId);
        if (
          !canManage(req) &&
          !["employee", "student", "branch_admin"].includes(roleOf(req))
        )
          return res.status(403).json({
            message: "Face registration is not available for this role.",
          });
        const faceEmbeddings = normalizeEmbeddings(req.body);
        if (faceEmbeddings.length < 3 || faceEmbeddings.length > 10)
          return res.status(400).json({
            message: "Capture 3 to 10 valid face samples before registering.",
          });
        const profile = await FaceProfile.findOneAndUpdate(
          { userId: user._id },
          {
            userId: user._id,
            employeeId: user.employeeId || user.studentId || "",
            name: user.name,
            role: user.role,
            faceEmbeddings,
            registeredAt: new Date(),
          },
          { returnDocument: "after", upsert: true, runValidators: true },
        );
        await User.findByIdAndUpdate(user._id, { faceSignature: "registered" });
        res.status(201).json({ profile, message: "Face profile registered." });
      } catch (error) {
        next(error);
      }
    },
  );

  app.post(
    "/api/face/verify",
    requireAuth,
    mongoReady,
    async (req, res, next) => {
      try {
        const user = await resolveMongoUser(req, req.body.userId);
        const result = await verifyPayload(req, user);
        const livenessVerified = Boolean(req.body.livenessVerified);
        const approved = result.faceVerified && livenessVerified;
        res.json({
          ...result,
          livenessVerified,
          approved,
          threshold: FACE_MATCH_THRESHOLD,
        });
      } catch (error) {
        next(error);
      }
    },
  );

  app.post(
    "/api/attendance/clockin",
    requireAuth,
    mongoReady,
    async (req, res, next) => {
      try {
        const user = await resolveMongoUser(req, req.body.userId);
        const now = new Date();
        const date = req.body.attendanceDate || now.toISOString().slice(0, 10);
        const verification = await verifyPayload(req, user);
        const livenessVerified = Boolean(req.body.livenessVerified);
        const gps = req.body.gps || req.body.location || {};
        const office = await officePoint(user, gps);
        const distance = distanceMeters(
          Number(gps.latitude),
          Number(gps.longitude),
          office.latitude,
          office.longitude,
        );
        const gpsVerified =
          distance !== null && distance <= office.radiusMeters;
        const device = await trustDevice(
          user,
          String(req.body.browserFingerprint || ""),
          String(req.body.deviceInfo || ""),
        );
        const approved =
          verification.faceVerified && livenessVerified && gpsVerified;
        const invalidReason = approved
          ? ""
          : verificationFailureReason({
              verification,
              livenessVerified,
              gpsVerified,
              distance,
              radius: office.radiusMeters,
            });
        const gpsConfigurationWarning = office.configured
          ? ""
          : "Office GPS is not configured; current GPS was accepted as a temporary office point.";

        const item = await Attendance.findOneAndUpdate(
          { userId: user._id, date },
          {
            userId: user._id,
            branchId: user.branchId || null,
            date,
            attendanceDate: date,
            clockInAt: now,
            clockIn: now,
            status: approved ? "present" : "invalid",
            invalidReason,
            clockInLocation: {
              latitude: gps.latitude,
              longitude: gps.longitude,
              address: gps.address,
              capturedAt: now,
            },
            locationDistanceMeters: distance ?? undefined,
            allowedRadiusMeters: office.radiusMeters,
            verification: req.body.imageData || "",
            faceVerified: verification.faceVerified,
            matchScore: verification.matchScore,
            livenessVerified,
            livenessChallenge: req.body.livenessChallenge || "",
            latitude: gps.latitude,
            longitude: gps.longitude,
            distanceFromOffice: distance ?? undefined,
            gpsVerified,
            browserFingerprint: req.body.browserFingerprint || "",
            deviceInfo: req.body.deviceInfo || "",
            ipAddress: clientIp(req),
            trustedDevice: device.trusted,
            securityWarning: [device.warning, gpsConfigurationWarning]
              .filter(Boolean)
              .join(" "),
          },
          { returnDocument: "after", upsert: true, runValidators: true },
        );
        res.status(approved ? 201 : 422).json({
          attendance: item,
          approved,
          warning: [device.warning, gpsConfigurationWarning]
            .filter(Boolean)
            .join(" "),
          message: approved ? "Attendance approved." : invalidReason,
        });
      } catch (error) {
        next(error);
      }
    },
  );

  app.post(
    "/api/attendance/clockout",
    requireAuth,
    mongoReady,
    async (req, res, next) => {
      try {
        const user = await resolveMongoUser(req, req.body.userId);
        const now = new Date();
        const date = req.body.attendanceDate || now.toISOString().slice(0, 10);
        const verification = await verifyPayload(req, user);
        const livenessVerified = Boolean(req.body.livenessVerified);
        const gps = req.body.gps || req.body.location || {};
        const office = await officePoint(user, gps);
        const distance = distanceMeters(
          Number(gps.latitude),
          Number(gps.longitude),
          office.latitude,
          office.longitude,
        );
        const gpsVerified =
          distance !== null && distance <= office.radiusMeters;
        const device = await trustDevice(
          user,
          String(req.body.browserFingerprint || ""),
          String(req.body.deviceInfo || ""),
        );
        const approved =
          verification.faceVerified && livenessVerified && gpsVerified;
        const invalidReason = approved
          ? ""
          : verificationFailureReason({
              verification,
              livenessVerified,
              gpsVerified,
              distance,
              radius: office.radiusMeters,
            });
        const gpsConfigurationWarning = office.configured
          ? ""
          : "Office GPS is not configured; current GPS was accepted as a temporary office point.";
        const item = await Attendance.findOneAndUpdate(
          { userId: user._id, date },
          {
            clockOutAt: now,
            clockOut: now,
            clockOutLocation: {
              latitude: gps.latitude,
              longitude: gps.longitude,
              address: gps.address,
              capturedAt: now,
            },
            locationDistanceMeters: distance ?? undefined,
            faceVerified: verification.faceVerified,
            matchScore: verification.matchScore,
            livenessVerified,
            livenessChallenge: req.body.livenessChallenge || "",
            gpsVerified,
            trustedDevice: device.trusted,
            securityWarning: [device.warning, gpsConfigurationWarning]
              .filter(Boolean)
              .join(" "),
            status: approved ? "present" : "invalid",
            invalidReason,
          },
          { returnDocument: "after", runValidators: true },
        );
        if (!item)
          return res
            .status(404)
            .json({ message: "Clock-in record not found for today." });
        res.status(approved ? 200 : 422).json({
          attendance: item,
          approved,
          warning: [device.warning, gpsConfigurationWarning]
            .filter(Boolean)
            .join(" "),
          message: approved ? "Clock-out verified." : invalidReason,
        });
      } catch (error) {
        next(error);
      }
    },
  );

  app.get(
    "/api/attendance/history",
    requireAuth,
    mongoReady,
    async (req, res, next) => {
      try {
        const user = await resolveMongoUser(req, req.query.userId);
        const filter =
          canManage(req) && req.query.userId
            ? { userId: user._id }
            : canManage(req)
              ? {}
              : { userId: user._id };
        const attendances = await Attendance.find(filter)
          .sort("-date")
          .limit(Math.min(Number(req.query.limit || 100), 500))
          .lean();
        res.json({ attendances });
      } catch (error) {
        next(error);
      }
    },
  );
}
