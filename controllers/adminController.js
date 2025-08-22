const User = require("../models/User");
const Product = require("../models/Product");
const Order = require("../models/Order");
const { isValidMongoId } = require('../middleware/sanitize');
const ActivityLog = require("../models/ActivityLog");

// Get all users
const getAllUsers = async (req, res) => {
  try {
    const users = await User.find({}).select("-password").sort("-createdAt");

    // Get order counts for each user
    const userOrderCounts = await Promise.all(
      users.map(async (user) => {
        const count = await Order.countDocuments({ user: user._id });
        return { userId: user._id, count };
      })
    );

    // Create a map of user IDs to order counts for easier lookup
    const orderCountMap = Object.fromEntries(
      userOrderCounts.map(({ userId, count }) => [userId.toString(), count])
    );

    // Format users with additional info
    const formattedUsers = users.map((user) => ({
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      status: user.isActive ? "Active" : "Inactive",
      orders: orderCountMap[user._id.toString()] || 0,
      lastLogin: user.lastLogin || user.createdAt,
      failedLoginAttempts: user.failedLoginAttempts,
      accountLockUntil: user.accountLockUntil,
      passwordLastChanged: user.passwordLastChanged,
      createdAt: user.createdAt,
      avatar:
        user.avatar ||
        "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?ixlib=rb-1.2.1",
    }));

    res.status(200).json(formattedUsers);
  } catch (error) {
    console.error("Error getting users:", error);
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

// // Get dashboard stats
// const getDashboardStats = async (req, res) => {
//   try {
//     const totalUsers = await User.countDocuments({ role: "user" });
//     const totalProducts = await Product.countDocuments();
//     const totalOrders = await Order.countDocuments();

//     // Get revenue stats
//     const orders = await Order.find({
//       orderStatus: { $in: ["Delivered", "Shipped"] },
//       paymentStatus: "Completed",
//     });
//     const totalRevenue = orders.reduce(
//       (sum, order) => sum + order.totalAmount,
//       0
//     );

//     // Get recent orders
//     const recentOrders = await Order.find()
//       .populate("user", "name email")
//       .sort("-createdAt")
//       .limit(5);

//     // Get low stock products (less than 10 items)
//     const lowStockProducts = await Product.find({ countInStock: { $lt: 10 } });

//     res.status(200).json({
//       stats: {
//         totalUsers,
//         totalProducts,
//         totalOrders,
//         totalRevenue,
//       },
//       recentOrders,
//       lowStockProducts,
//     });
//   } catch (error) {
//     res.status(500).json({ message: "Server Error" });
//   }
// };

// Update user status
const updateUserStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!isValidMongoId(id)) {
      return res.status(400).json({ message: 'Invalid user ID' });
    }

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Convert status string to boolean isActive
    user.isActive = status === 'Active';
    await user.save();

    res.json({ message: 'User status updated successfully' });
  } catch (error) {
    console.error('Update user status error:', error);
    res.status(500).json({ message: 'Error updating user status' });
  }
};

// Update user role
const updateUserRole = async (req, res) => {
  try {
    const { id } = req.params;
    const { role } = req.body;

    if (!isValidMongoId(id)) {
      return res.status(400).json({ message: 'Invalid user ID' });
    }

    // Validate role
    const validRoles = ['user', 'admin'];
    if (!validRoles.includes(role)) {
      return res.status(400).json({ message: 'Invalid role' });
    }

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    user.role = role;
    await user.save();

    res.json({ message: 'User role updated successfully' });
  } catch (error) {
    console.error('Update user role error:', error);
    res.status(500).json({ message: 'Error updating user role' });
  }
};

// Delete user
const deleteUser = async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidMongoId(id)) {
      return res.status(400).json({ message: 'Invalid user ID' });
    }

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    await User.findByIdAndDelete(id);
    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ message: 'Error deleting user' });
  }
};

module.exports = {
  getAllUsers,
  // getDashboardStats,
  updateUserStatus,
  updateUserRole,
  deleteUser,
};
