import mongoose from "mongoose";

const embeddingSchema = new mongoose.Schema(
  {
    label: { type: String, trim: true, default: "face" },
    vector: {
      type: [Number],
      validate: [(items) => Array.isArray(items) && items.length >= 32, "Face embedding must contain at least 32 values."],
      required: true,
    },
    capturedAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

const faceProfileSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true, index: true },
    employeeId: { type: String, trim: true },
    name: { type: String, required: true, trim: true },
    role: { type: String, enum: ["super_admin", "branch_admin", "employee", "student"], required: true },
    faceEmbeddings: {
      type: [embeddingSchema],
      validate: [(items) => Array.isArray(items) && items.length >= 3 && items.length <= 10, "Capture 3 to 10 face samples."],
      required: true,
    },
    registeredAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

faceProfileSchema.virtual("updatedAtProfile").get(function updatedAtProfile() {
  return this.updatedAt;
});

export default mongoose.models.FaceProfile || mongoose.model("FaceProfile", faceProfileSchema);
