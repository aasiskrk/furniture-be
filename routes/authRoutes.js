const express = require("express");
const router = express.Router();
const rateLimit = require('express-rate-limit');
const {
  register,
  login,
  logout,
  getProfile,
  updateProfile,
  addAddress,
  getAddresses,
  updateAddress,
  deleteAddress,
  setDefaultAddress,
  changePassword,
  getActivityLogs,
} = require("../controllers/authController");
const { protect } = require("../middleware/authMiddleware");

// Rate limiters for auth routes
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // limit each IP to 5 login attempts per windowMs
  message: { message: 'Too many login attempts, please try again after 15 minutes' }
});

const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3, // limit each IP to 3 registration attempts per hour
  message: { message: 'Too many registration attempts, please try again after an hour' }
});

// Public routes with rate limiting
router.post("/register", registerLimiter, register);
router.post("/login", loginLimiter, login);
router.post("/logout", protect, logout);

// Protected routes
router.get("/profile", protect, getProfile);
router.put("/profile", protect, updateProfile);
router.put("/change-password", protect, changePassword);

// Activity logs route
router.get("/activity-logs", protect, getActivityLogs);

// Address routes
router.post("/address", protect, addAddress);
router.get("/address", protect, getAddresses);
router.put("/address/:addressId", protect, updateAddress);
router.delete("/address/:addressId", protect, deleteAddress);
router.put("/address/:addressId/default", protect, setDefaultAddress);

module.exports = router;
