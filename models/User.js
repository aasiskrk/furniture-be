const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const addressSchema = new mongoose.Schema({
  fullName: {
    type: String,
    required: true,
    trim: true,
  },
  phone: {
    type: String,
    required: true,
    trim: true,
  },
  address: {
    type: String,
    required: true,
    trim: true,
  },
  city: {
    type: String,
    required: true,
    trim: true,
  },
  state: {
    type: String,
    required: true,
    trim: true,
  },
  pinCode: {
    type: String,
    required: true,
    trim: true,
  },
  isDefault: {
    type: Boolean,
    default: false,
  },
});

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
    },
    password: {
      type: String,
      required: true,
      select: false,
    },
    role: {
      type: String,
      enum: ["user", "admin"],
      default: "user",
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    lastLogin: {
      type: Date,
      default: Date.now,
    },
    failedLoginAttempts: {
      type: Number,
      default: 0,
    },
    accountLockUntil: {
      type: Date,
      default: null,
    },
    passwordLastChanged: {
      type: Date,
      default: Date.now,
    },
    passwordHistory: [{
      password: String,
      changedAt: Date
    }],
    avatar: {
      type: String,
    },
    addresses: [addressSchema],
  },
  {
    timestamps: true,
  }
);

// Hash password before saving ONLY if it's not already hashed
userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();

  // Check if the password is already hashed
  if (this.password.startsWith("$2a$") || this.password.startsWith("$2b$")) {
    return next();
  }

  try {
    // Add current password to history before changing
    if (this.password) {
      this.passwordHistory = this.passwordHistory || [];
      if (this.passwordHistory.length >= 5) {
        this.passwordHistory.shift(); // Remove oldest password if we have 5
      }
      this.passwordHistory.push({
        password: this.password,
        changedAt: new Date()
      });
    }

    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    this.passwordLastChanged = new Date();
    next();
  } catch (error) {
    next(error);
  }
});

// Method to compare password
userSchema.methods.comparePassword = async function (candidatePassword) {
  try {
    return await bcrypt.compare(candidatePassword, this.password);
  } catch (error) {
    throw new Error("Password comparison failed");
  }
};

// Method to check if password is expired (90 days)
userSchema.methods.isPasswordExpired = function() {
  const ninetyDaysInMs = 90 * 24 * 60 * 60 * 1000;
  return Date.now() - this.passwordLastChanged.getTime() > ninetyDaysInMs;
};

// Method to check if account is locked
userSchema.methods.isAccountLocked = function() {
  return this.accountLockUntil && this.accountLockUntil > new Date();
};

// Method to increment failed login attempts
userSchema.methods.incrementLoginAttempts = async function() {
  this.failedLoginAttempts += 1;
  
  // Lock account after 5 failed attempts
  if (this.failedLoginAttempts >= 5) {
    this.accountLockUntil = new Date(Date.now() + 30 * 60 * 1000); // Lock for 30 minutes
  }
  
  await this.save();
};

// Method to reset failed login attempts
userSchema.methods.resetLoginAttempts = async function() {
  this.failedLoginAttempts = 0;
  this.accountLockUntil = null;
  await this.save();
};

// Method to check if password was used before
userSchema.methods.isPasswordReused = async function(newPassword) {
  for (const historyEntry of this.passwordHistory) {
    if (await bcrypt.compare(newPassword, historyEntry.password)) {
      return true;
    }
  }
  return false;
};

module.exports = mongoose.model("User", userSchema);
