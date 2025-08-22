const express = require("express");
const router = express.Router();
const {
  getProducts,
  getProductById,
  createProduct,
  updateProduct,
  deleteProduct,
  getCategories,
} = require("../controllers/productController");
const { protect, admin } = require("../middleware/authMiddleware");

// Public routes
router.get("/", getProducts);
router.get("/categories", getCategories);
router.get("/:id", getProductById);

// Protected admin routes
router.post("/", protect, admin, createProduct);
router.put("/:id", protect, admin, updateProduct);
router.delete("/:id", protect, admin, deleteProduct);

module.exports = router;
