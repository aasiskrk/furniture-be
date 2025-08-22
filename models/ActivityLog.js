const mongoose = require("mongoose");

const activityLogSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    action: {
      type: String,
      required: true,
      enum: [
        "login",
        "logout",
        "register",
        "failed_login",
        "profile_update",
        "password_change",
        "password_reset",
        "account_lock",
        "account_unlock",
        "address_add",
        "address_update",
        "address_delete",
        "address_set_default",
        "order_create",
        "order_status_update",
        "order_cancel",
        "order_delivered"
      ],
    },
    ip: {
      type: String,
      default: "unknown",
    },
    userAgent: {
      type: String,
      default: "unknown",
    },
    status: {
      type: String,
      enum: ["success", "failure"],
      required: true,
    },
    details: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

// Index for efficient querying of recent failed login attempts
activityLogSchema.index({ user: 1, action: 1, createdAt: -1 });

// Index for faster queries and automatic cleanup of old logs
activityLogSchema.index({ user: 1, createdAt: -1 });
activityLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 7776000 }); // 90 days TTL

module.exports = mongoose.model("ActivityLog", activityLogSchema); 