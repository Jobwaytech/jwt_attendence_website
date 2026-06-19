import mongoose from "mongoose";

const locationSchema = new mongoose.Schema(
  {
    latitude: { type: Number, min: -90, max: 90 },
    longitude: { type: Number, min: -180, max: 180 },
    address: { type: String, trim: true },
    capturedAt: { type: Date },
  },
  { _id: false },
);

const attendanceSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: "Branch", default: null, index: true },
    date: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    attendanceDate: { type: String, match: /^\d{4}-\d{2}-\d{2}$/ },
    clockInAt: { type: Date },
    clockOutAt: { type: Date },
    clockIn: { type: Date },
    clockOut: { type: Date },
    status: { type: String, enum: ["present", "absent", "invalid"], default: "present" },
    invalidReason: { type: String, trim: true },
    clockInLocation: locationSchema,
    clockOutLocation: locationSchema,
    locationDistanceMeters: { type: Number, min: 0 },
    allowedRadiusMeters: { type: Number, min: 0 },
    verification: { type: String, trim: true },
    faceVerified: { type: Boolean, default: false },
    matchScore: { type: Number, min: 0, max: 100, default: 0 },
    livenessVerified: { type: Boolean, default: false },
    livenessChallenge: { type: String, enum: ["blink", "turn_left", "turn_right", "smile", ""], default: "" },
    latitude: { type: Number, min: -90, max: 90 },
    longitude: { type: Number, min: -180, max: 180 },
    distanceFromOffice: { type: Number, min: 0 },
    gpsVerified: { type: Boolean, default: false },
    browserFingerprint: { type: String, trim: true },
    deviceInfo: { type: String, trim: true },
    ipAddress: { type: String, trim: true },
    trustedDevice: { type: Boolean, default: false },
    securityWarning: { type: String, trim: true },
  },
  { timestamps: true },
);

attendanceSchema.index({ userId: 1, date: 1 }, { unique: true });

export default mongoose.models.Attendance || mongoose.model("Attendance", attendanceSchema);
