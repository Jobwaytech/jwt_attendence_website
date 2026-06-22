import mongoose from "mongoose";

const auditLogSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    action: { type: String, required: true, trim: true, index: true },
    resource: { type: String, trim: true, index: true },
    resourceId: { type: String, trim: true },
    role: { type: String, trim: true },
    ipAddress: { type: String, trim: true },
    userAgent: { type: String, trim: true },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true },
);

export default mongoose.models.AuditLog ||
  mongoose.model("AuditLog", auditLogSchema);
