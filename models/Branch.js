import mongoose from "mongoose";

const branchSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, minlength: 2 },
    code: { type: String, required: true, unique: true, uppercase: true, trim: true },
    address: { type: String, required: true, trim: true },
    manager: { type: String, trim: true },
    contactEmail: { type: String, lowercase: true, trim: true, match: /^[^\s@]+@[^\s@]+\.[^\s@]+$/ },
    contactPhone: { type: String, trim: true },
    officeLocation: {
      latitude: { type: Number, min: -90, max: 90 },
      longitude: { type: Number, min: -180, max: 180 },
      allowedRadiusMeters: { type: Number, min: 0, default: 150 },
    },
  },
  { timestamps: true },
);

export default mongoose.models.Branch || mongoose.model("Branch", branchSchema);
