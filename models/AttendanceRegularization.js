import mongoose from "mongoose";

const REGULARIZATION_TYPES = [
  "missing_clock_in",
  "missing_clock_out",
  "attendance_correction",
  "late_entry",
];
const REGULARIZATION_STATUSES = ["pending", "approved", "rejected"];

const attendanceRegularizationSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    branchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Branch",
      default: null,
      index: true,
    },
    type: { type: String, enum: REGULARIZATION_TYPES, required: true },
    date: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    requestedClockIn: { type: String, trim: true },
    requestedClockOut: { type: String, trim: true },
    reason: { type: String, required: true, trim: true, minlength: 3 },
    status: {
      type: String,
      enum: REGULARIZATION_STATUSES,
      default: "pending",
      index: true,
    },
    branchAdminDecisionBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    branchAdminDecisionAt: { type: Date },
    superAdminDecisionBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    superAdminDecisionAt: { type: Date },
    remarks: { type: String, trim: true },
  },
  { timestamps: true },
);

export { REGULARIZATION_STATUSES, REGULARIZATION_TYPES };
export default mongoose.models.AttendanceRegularization ||
  mongoose.model("AttendanceRegularization", attendanceRegularizationSchema);
