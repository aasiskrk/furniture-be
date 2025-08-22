const express = require("express");
const router = express.Router();
const { protect, admin } = require("../middleware/authMiddleware");
const {
  createOrder,
  getOrderById,
  getMyOrders,
  updateOrderStatus,
  handleEsewaSuccess,
  handleEsewaFailure,
  getAllOrders,
  updatePaymentStatus,
  cancelOrder,
} = require("../controllers/orderController");

// Protected routes
router.post("/", protect, createOrder);
router.get("/myorders", protect, getMyOrders);
router.get("/:id", protect, getOrderById);
router.put("/:id/status", protect, admin, updateOrderStatus);
router.put("/:id/payment", protect, admin, updatePaymentStatus);
router.put("/:id/cancel", protect, cancelOrder);

// Admin routes
router.get("/", protect, admin, getAllOrders);

// eSewa payment routes (public)
router.get("/esewa/success", handleEsewaSuccess);
router.get("/esewa/failure", handleEsewaFailure);

module.exports = router;
