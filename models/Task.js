import mongoose from "mongoose";

const TASK_STATUSES = ["pending", "in_progress", "completed", "hold", "rejected"];
const TASK_PRIORITIES = ["low", "medium", "high", "urgent"];

const taskAssignmentSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    status: { type: String, enum: TASK_STATUSES, default: "pending" },
    progress: { type: Number, min: 0, max: 100, default: 0 },
    remarks: { type: String, trim: true },
    updatedAt: { type: Date },
  },
  { _id: true },
);

const taskSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, minlength: 2 },
    description: { type: String, trim: true },
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: "Branch", default: null, index: true },
    priority: { type: String, enum: TASK_PRIORITIES, default: "medium" },
    deadline: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    assignmentType: { type: String, enum: ["individual", "team"], default: "individual" },
    teamName: { type: String, trim: true },
    assignedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    assignments: { type: [taskAssignmentSchema], validate: [(items) => items.length > 0, "At least one assignee is required."] },
  },
  { timestamps: true },
);

export { TASK_PRIORITIES, TASK_STATUSES };
export default mongoose.models.Task || mongoose.model("Task", taskSchema);
