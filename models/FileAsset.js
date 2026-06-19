import mongoose from "mongoose";

const fileAssetSchema = new mongoose.Schema(
  {
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null, index: true },
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: "Branch", default: null, index: true },
    category: { type: String, enum: ["profile_photo", "employee_document", "student_document", "leave_attachment"], required: true, index: true },
    originalName: { type: String, required: true, trim: true },
    mimeType: { type: String, required: true, trim: true },
    size: { type: Number, min: 0, default: 0 },
    provider: { type: String, enum: ["local", "cloudinary", "s3"], default: "local" },
    url: { type: String, required: true, trim: true },
    publicId: { type: String, trim: true },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true },
);

export default mongoose.models.FileAsset || mongoose.model("FileAsset", fileAssetSchema);
