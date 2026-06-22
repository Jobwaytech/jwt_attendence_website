import mongoose from "mongoose";
import { isMongoConnected } from "../config/db.js";
import {
  Attendance,
  AttendanceRegularization,
  Calendar,
  FaceProfile,
  Leave,
  Report,
  Task,
  User,
} from "../models/index.js";

function mongoReady(_req, res, next) {
  if (!isMongoConnected())
    return res.status(503).json({
      message:
        "MongoDB is not connected. Set MONGODB_URI and restart the server.",
    });
  next();
}

async function currentStudent(req, res, next) {
  try {
    if (req.user?.role !== "student")
      return res.status(403).json({ message: "Student access only." });
    const student = await User.findOne({
      email: req.user.email.toLowerCase(),
      role: "student",
    });
    if (!student)
      return res
        .status(404)
        .json({ message: "Student MongoDB profile not found." });
    req.mongoStudent = student;
    next();
  } catch (error) {
    next(error);
  }
}

function publicStudent(user) {
  return {
    id: String(user._id),
    studentId: user.studentId || user.employeeId || String(user._id),
    name: user.name,
    email: user.email,
    role: user.role,
    phone: user.phone || "",
    branchId: user.branchId ? String(user.branchId) : "",
    dob: user.dob ? new Date(user.dob).toISOString().slice(0, 10) : "",
    profile: user.profile || "",
    createdAt: user.createdAt,
  };
}

function taskForStudent(task, studentId) {
  const assignments = (task.assignments || []).filter(
    (item) => String(item.userId) === studentId,
  );
  return assignments.map((assignment) => ({
    id: String(task._id),
    assignmentId: String(assignment._id),
    title: task.title,
    description: task.description || "",
    category:
      task.assignmentType === "team" ? "Internship Task" : "Daily Assignment",
    deadline: task.deadline,
    status: assignment.status,
    priority: task.priority,
    remarks: assignment.remarks || "",
    submittedAt: assignment.updatedAt,
    teamName: task.teamName || "",
  }));
}

export function registerStudentPortalRoutes(app, { requireAuth }) {
  app.get(
    "/api/student/workspace",
    requireAuth,
    mongoReady,
    currentStudent,
    async (req, res, next) => {
      try {
        const student = req.mongoStudent;
        const studentId = String(student._id);
        const [
          attendances,
          leaves,
          taskDocs,
          calendars,
          reports,
          faceProfile,
          regularizations,
        ] = await Promise.all([
          Attendance.find({ userId: student._id })
            .sort("-date")
            .limit(200)
            .lean(),
          Leave.find({ userId: student._id })
            .sort("-createdAt")
            .limit(100)
            .lean(),
          Task.find({ "assignments.userId": student._id })
            .sort("-createdAt")
            .limit(100)
            .lean(),
          Calendar.find({
            $or: [
              { scope: "company" },
              { scope: "student", studentId: student._id },
              ...(student.branchId
                ? [{ scope: "branch", branchId: student.branchId }]
                : []),
            ],
          })
            .sort("startDate")
            .limit(100)
            .lean(),
          Report.find({
            $or: [
              { "rows.employeeId": student.studentId },
              { "rows.employeeId": String(student._id) },
            ],
          })
            .sort("-createdAt")
            .limit(20)
            .lean(),
          FaceProfile.findOne({ userId: student._id }).lean(),
          AttendanceRegularization.find({ userId: student._id })
            .sort("-createdAt")
            .limit(100)
            .lean(),
        ]);

        res.json({
          student: publicStudent(student),
          attendances,
          leaves,
          tasks: taskDocs.flatMap((task) => taskForStudent(task, studentId)),
          calendars,
          reports,
          regularizations,
          faceProfile: faceProfile
            ? {
                registered: true,
                registeredAt: faceProfile.registeredAt,
                updatedAt: faceProfile.updatedAt,
                samples: faceProfile.faceEmbeddings?.length || 0,
              }
            : { registered: false, samples: 0 },
        });
      } catch (error) {
        next(error);
      }
    },
  );

  app.post(
    "/api/student/leaves",
    requireAuth,
    mongoReady,
    currentStudent,
    async (req, res, next) => {
      try {
        const item = await Leave.create({
          userId: req.mongoStudent._id,
          branchId: req.mongoStudent.branchId || null,
          leaveType: req.body.leaveType,
          fromDate: req.body.fromDate,
          toDate: req.body.toDate,
          reason: req.body.reason,
          status: "pending",
        });
        res.status(201).json({ item });
      } catch (error) {
        next(error);
      }
    },
  );

  app.put(
    "/api/student/tasks/:taskId/assignments/:assignmentId",
    requireAuth,
    mongoReady,
    currentStudent,
    async (req, res, next) => {
      try {
        if (
          !mongoose.isValidObjectId(req.params.taskId) ||
          !mongoose.isValidObjectId(req.params.assignmentId)
        )
          return res.status(400).json({ message: "Invalid task assignment." });
        const task = await Task.findOne({
          _id: req.params.taskId,
          "assignments._id": req.params.assignmentId,
          "assignments.userId": req.mongoStudent._id,
        });
        if (!task)
          return res
            .status(404)
            .json({ message: "Task assignment not found." });
        const assignment = task.assignments.id(req.params.assignmentId);
        assignment.status = req.body.status || assignment.status;
        assignment.progress =
          assignment.status === "completed"
            ? 100
            : Number(req.body.progress ?? assignment.progress ?? 0);
        assignment.remarks = req.body.remarks || "";
        assignment.updatedAt = new Date();
        await task.save();
        res.json({ item: task });
      } catch (error) {
        next(error);
      }
    },
  );

  app.post(
    "/api/student/regularizations",
    requireAuth,
    mongoReady,
    currentStudent,
    async (req, res, next) => {
      try {
        const item = await AttendanceRegularization.create({
          userId: req.mongoStudent._id,
          branchId: req.mongoStudent.branchId || null,
          type: req.body.type,
          date: req.body.date,
          requestedClockIn: req.body.requestedClockIn,
          requestedClockOut: req.body.requestedClockOut,
          reason: req.body.reason,
          status: "pending",
        });
        res.status(201).json({ item });
      } catch (error) {
        next(error);
      }
    },
  );
}
