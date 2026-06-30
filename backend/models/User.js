import mongoose from "mongoose";

const USER_ROLES = ["super_admin", "branch_admin", "employee", "student"];

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, minlength: 2 },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      match: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
    },
    passwordHash: { type: String, default: null },
    role: {
      type: String,
      enum: USER_ROLES,
      required: true,
      default: "employee",
    },
    roleLabel: { type: String, trim: true },
    branchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Branch",
      default: null,
    },
    legacyId: { type: String, index: true },
    phone: { type: String, trim: true },
    dob: { type: Date },
    profile: { type: String, trim: true },
    employeeId: { type: String, trim: true },
    studentId: { type: String, trim: true },
    salary: { type: Number, min: 0 },
    provider: {
      type: String,
      enum: ["password", "google"],
      default: "password",
    },
    googleSub: { type: String, trim: true },
    picture: { type: String, trim: true },
    faceSignature: { type: String, trim: true },
    trustedDevices: {
      type: [
        {
          fingerprint: { type: String, trim: true },
          deviceInfo: { type: String, trim: true },
          firstSeenAt: { type: Date, default: Date.now },
          lastSeenAt: { type: Date, default: Date.now },
        },
      ],
      default: [],
    },
  },
  { timestamps: true },
);

userSchema.virtual("roleName").get(function roleName() {
  return this.roleLabel || this.role;
});

export { USER_ROLES };
export default mongoose.models.User || mongoose.model("User", userSchema);
