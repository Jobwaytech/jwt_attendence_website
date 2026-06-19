import mongoose from "mongoose";

const loginHistorySchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null, index: true },
    email: { type: String, required: true, lowercase: true, trim: true, index: true },
    role: { type: String, trim: true },
    status: { type: String, enum: ["success", "failed"], required: true, index: true },
    ipAddress: { type: String, trim: true },
    userAgent: { type: String, trim: true },
    message: { type: String, trim: true },
  },
  { timestamps: true },
);

export default mongoose.models.LoginHistory || mongoose.model("LoginHistory", loginHistorySchema);
