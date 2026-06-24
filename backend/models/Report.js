import mongoose from "mongoose";

const reportSchema = new mongoose.Schema(
  {
    reportType: {
      type: String,
      enum: [
        "branch",
        "monthly",
        "attendance",
        "task",
        "payroll",
        "performance",
      ],
      required: true,
    },
    month: { type: String, match: /^\d{4}-\d{2}$/ },
    branchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Branch",
      default: null,
      index: true,
    },
    generatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    totals: { type: mongoose.Schema.Types.Mixed, default: {} },
    rows: { type: [mongoose.Schema.Types.Mixed], default: [] },
    notes: { type: String, trim: true },
  },
  { timestamps: true },
);

reportSchema.index({ reportType: 1, month: 1, branchId: 1 });

export default mongoose.models.Report || mongoose.model("Report", reportSchema);
