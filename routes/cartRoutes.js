const express = require("express");
const router = express.Router();
const { protect } = require("../middleware/authMiddleware");
const {
  getCart,
  addToCart,
  updateCartItem,
  removeFromCart,
  clearCart,
} = require("../controllers/cartController");

router.use(protect); // All cart routes require authentication

router
  .route("/")
  .get(getCart)
  .post(addToCart)
  .put(updateCartItem)
  .delete(clearCart);

router.delete("/item/:productId", removeFromCart);

module.exports = router;
