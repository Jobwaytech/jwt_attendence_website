import mongoose from "mongoose";

const leaveSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: "Branch", default: null, index: true },
    leaveType: { type: String, enum: ["casual", "sick", "permission"], required: true },
    fromDate: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    toDate: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    reason: { type: String, required: true, trim: true, minlength: 3 },
    status: { type: String, enum: ["pending", "approved", "rejected"], default: "pending" },
    decidedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    decidedAt: { type: Date },
  },
  { timestamps: true },
);

export default mongoose.models.Leave || mongoose.model("Leave", leaveSchema);
