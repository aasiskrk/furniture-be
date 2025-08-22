const Order = require("../models/Order");
const Cart = require("../models/Cart");
const Product = require("../models/Product");
const ActivityLog = require("../models/ActivityLog");
const axios = require("axios");
const { isValidMongoId, isValidPhone, isValidPinCode } = require('../middleware/sanitize');

// Create new order
const createOrder = async (req, res) => {
  try {
    const { orderItems, totalPrice, paymentMethod, shippingAddress } = req.body;
    const { fullName, phone, address, city, state, pinCode } = shippingAddress;

    // Validate required fields
    if (!orderItems || !totalPrice || !paymentMethod || !fullName || !phone || !address || !city || !state || !pinCode) {
      return res.status(400).json({ message: 'Please provide all required fields' });
    }

    // Validate phone and PIN code
    if (!isValidPhone(phone)) {
      return res.status(400).json({ message: 'Please provide a valid phone number' });
    }

    if (!isValidPinCode(pinCode)) {
      return res.status(400).json({ message: 'Please provide a valid PIN code' });
    }

    // Validate items array
    if (!Array.isArray(orderItems) || orderItems.length === 0) {
      return res.status(400).json({ message: 'Please provide valid order items' });
    }

    // Validate each item has required fields and valid product IDs
    for (const item of orderItems) {
      if (!item.product || !item.quantity || !item.price) {
        return res.status(400).json({ message: 'Invalid item data' });
      }
      if (!isValidMongoId(item.product)) {
        return res.status(400).json({ message: 'Invalid product ID' });
      }
    }

    const order = await Order.create({
      user: req.user._id,
      orderItems,
      totalPrice,
      paymentMethod,
      shippingAddress: {
        fullName,
        phone,
        address,
        city,
        state,
        pinCode
      }
    });

    await ActivityLog.create({
      user: req.user._id,
      action: 'order_create',
      status: 'success',
      details: {
        orderId: order._id,
        totalPrice,
        paymentMethod,
        itemCount: orderItems.length
      },
      ip: req.ip,
      userAgent: req.get('user-agent')
    });

    res.status(201).json(order);
  } catch (error) {
    console.error('Create order error:', error);
    res.status(500).json({ message: 'Error creating order' });
  }
};

// Get order by ID
const getOrderById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidMongoId(id)) {
      return res.status(400).json({ message: 'Invalid order ID' });
    }

    const order = await Order.findById(id)
      .populate('user', 'name email')
      .populate('orderItems.product', 'name pictures price');

    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    // Check if user is authorized to view this order
    if (order.user._id.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Not authorized to view this order' });
    }

    res.json(order);
  } catch (error) {
    console.error('Get order error:', error);
    res.status(500).json({ message: 'Error retrieving order' });
  }
};

// Get logged in user's orders
const getMyOrders = async (req, res) => {
  try {
    const orders = await Order.find({ user: req.user._id })
      .populate(
        "orderItems.product",
        "name price pictures colors material dimensions"
      )
      .sort("-createdAt");

    res.status(200).json(orders);
  } catch (error) {
    console.error("Error fetching orders:", error);
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

// Get all orders (admin only)
const getAllOrders = async (req, res) => {
  try {
    const orders = await Order.find({})
      .populate("user", "name email")
      .populate(
        "orderItems.product",
        "name price pictures colors material dimensions"
      )
      .sort("-createdAt");

    res.status(200).json(orders);
  } catch (error) {
    res.status(500).json({ message: "Server Error" });
  }
};

// Update order status (admin only)
const updateOrderStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!isValidMongoId(id)) {
      return res.status(400).json({ message: 'Invalid order ID' });
    }

    const validStatuses = ['Processing', 'Shipped', 'Delivered', 'Cancelled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ message: 'Invalid order status' });
    }

    const order = await Order.findById(id);
    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    const oldStatus = order.status;
    order.status = status;
    await order.save();

    await ActivityLog.create({
      user: req.user._id,
      action: 'order_status_update',
      status: 'success',
      details: {
        orderId: order._id,
        oldStatus,
        newStatus: status,
        orderTotal: order.totalPrice
      },
      ip: req.ip,
      userAgent: req.get('user-agent')
    });

    res.json(order);
  } catch (error) {
    console.error('Update order status error:', error);
    res.status(500).json({ message: 'Error updating order status' });
  }
};

// Update payment status (admin only)
const updatePaymentStatus = async (req, res) => {
  try {
    const { isPaid } = req.body;
    const order = await Order.findById(req.params.id);

    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    order.isPaid = isPaid;
    order.paidAt = isPaid ? Date.now() : null;

    const updatedOrder = await order.save();
    res.status(200).json(updatedOrder);
  } catch (error) {
    console.error("Error updating payment status:", error);
    res.status(500).json({
      message: "Error updating payment status",
      error: error.message,
    });
  }
};

// Handle eSewa payment success
const handleEsewaSuccess = async (req, res) => {
  try {
    const { oid, amt, refId } = req.query;
    console.log("eSewa success params:", { oid, amt, refId });

    const order = await Order.findById(oid);
    if (!order) {
      console.error("Order not found:", oid);
      return res.status(404).json({ message: "Order not found" });
    }

    // Validate stock again before confirming payment
    for (const item of order.orderItems) {
      const product = await Product.findById(item.product);
      if (!product || product.countInStock < item.quantity) {
        // If stock is insufficient, mark order as cancelled
        order.status = "Cancelled";
        await order.save();
        return res.status(400).json({
          message: `Insufficient stock for some items. Order cancelled.`,
        });
      }
    }

    // Reduce stock for each item
    for (const item of order.orderItems) {
      const product = await Product.findById(item.product);
      product.countInStock -= item.quantity;
      await product.save();
    }

    // Update order with payment details
    order.isPaid = true;
    order.paidAt = Date.now();
    order.status = "Processing"; // Change from Payment Pending to Processing
    order.paymentResult = {
      status: "Success",
      transactionId: refId,
      amount: amt,
      referenceId: refId,
    };

    await order.save();
    console.log("Order updated successfully:", order._id);

    // Redirect to frontend order detail page
    const redirectUrl = `${process.env.FRONTEND_URL}/order/${oid}`;
    console.log("Redirecting to:", redirectUrl);

    // Set CORS headers to allow the redirect
    res.header("Access-Control-Allow-Origin", process.env.FRONTEND_URL);
    res.header("Access-Control-Allow-Credentials", "true");

    // Use HTML redirect with cart clearing and success message
    res.send(`
      <html>
        <head>
          <title>Payment Successful</title>
          <script>
            // Function to clear cart and update navbar
            function handlePaymentSuccess() {
              // Clear cart cookie
              document.cookie = "furniture_cart=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
              
              // Store success message in sessionStorage to show after redirect
              sessionStorage.setItem('paymentSuccess', 'true');
              
              // Redirect to order details
              window.location.href = "${redirectUrl}";
              
            }

            // Execute after page loads
            window.onload = handlePaymentSuccess;
          </script>
        </head>
        <body>
          <div style="display: flex; justify-content: center; align-items: center; height: 100vh; font-family: Arial, sans-serif;">
            <div style="text-align: center;">
              <h2 style="color: #4CAF50;">Payment Successful!</h2>
              <p>Redirecting to your order details...</p>
              
            </div>
          </div>
        </body>
      </html>
    `);
  } catch (error) {
    console.error("Error handling eSewa success:", error);
    const failureUrl = `${process.env.FRONTEND_URL}/checkout?error=payment-failed`;
    res.redirect(failureUrl);
  }
};

// Handle eSewa payment failure
const handleEsewaFailure = async (req, res) => {
  try {
    const { oid } = req.query;
    console.log("eSewa failure params:", { oid });

    if (oid) {
      // Delete the pending order
      await Order.deleteOne({ _id: oid, status: "Payment Pending" });
      console.log("Temporary order deleted:", oid);
    }

    // Redirect to frontend with error message
    const redirectUrl = `${process.env.FRONTEND_URL}/checkout`;
    console.log("Redirecting to:", redirectUrl);

    // Use HTML redirect with error message
    res.send(`
      <html>
        <head>
          <title>Payment Failed</title>
          <script>
            sessionStorage.setItem('paymentError', 'Payment failed. Please try again.');
            window.location.href = "${redirectUrl}";
          </script>
        </head>
        <body>
          <div style="display: flex; justify-content: center; align-items: center; height: 100vh; font-family: Arial, sans-serif;">
            <div style="text-align: center;">
              <h2 style="color: #DC2626;">Payment Failed</h2>
              <p>Redirecting back to checkout...</p>
            </div>
          </div>
        </body>
      </html>
    `);
  } catch (error) {
    console.error("Error handling eSewa failure:", error);
    res.redirect(`${process.env.FRONTEND_URL}/checkout`);
  }
};

// Cancel order
const cancelOrder = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    
    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    // Check if user is authorized to cancel this order
    if (order.user.toString() !== req.user._id.toString() && !req.user.isAdmin) {
      return res.status(401).json({ message: "Not authorized to cancel this order" });
    }

    // Check if order can be cancelled
    if (order.status !== "Pending" && order.status !== "Processing") {
      return res.status(400).json({ message: "Order cannot be cancelled at this stage" });
    }

    if (order.isPaid) {
      return res.status(400).json({ message: "Paid orders cannot be cancelled" });
    }

    // Update order status to cancelled
    order.status = "Cancelled";
    const updatedOrder = await order.save();

    // Log order cancellation
    await ActivityLog.create({
      user: req.user._id,
      action: 'order_cancel',
      status: 'success',
      details: {
        orderId: order._id,
        orderTotal: order.totalPrice,
        reason: 'User cancelled',
        orderStatus: order.status
      },
      ip: req.ip,
      userAgent: req.get('user-agent')
    });

    res.status(200).json(updatedOrder);
  } catch (error) {
    console.error("Error cancelling order:", error);
    // Log cancellation failure
    if (req.user) {
      await ActivityLog.create({
        user: req.user._id,
        action: 'order_cancel',
        status: 'failure',
        details: {
          orderId: req.params.id,
          error: error.message
        },
        ip: req.ip,
        userAgent: req.get('user-agent')
      });
    }
    res.status(500).json({ message: "Error cancelling order", error: error.message });
  }
};

module.exports = {
  createOrder,
  getOrderById,
  getMyOrders,
  getAllOrders,
  updateOrderStatus,
  updatePaymentStatus,
  handleEsewaSuccess,
  handleEsewaFailure,
  cancelOrder,
};
