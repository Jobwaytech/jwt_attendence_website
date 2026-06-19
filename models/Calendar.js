import mongoose from "mongoose";

const CALENDAR_TYPES = ["company_holiday", "branch_holiday", "employee_event", "student_event", "meeting_reminder", "training_schedule", "exam_schedule", "birthday", "national_holiday", "government_holiday"];

const calendarSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, minlength: 2 },
    type: { type: String, enum: CALENDAR_TYPES, required: true },
    scope: { type: String, enum: ["company", "branch", "employee", "student"], default: "company" },
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: "Branch", default: null, index: true },
    employeeId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    startDate: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    endDate: { type: String, match: /^\d{4}-\d{2}-\d{2}$/ },
    startTime: { type: String, trim: true },
    description: { type: String, trim: true },
    source: { type: String, enum: ["default", "custom"], default: "custom" },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true },
);

calendarSchema.index({ startDate: 1, type: 1 });

export { CALENDAR_TYPES };
export default mongoose.models.Calendar || mongoose.model("Calendar", calendarSchema);
