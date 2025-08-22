const jwt = require("jsonwebtoken");
const User = require("../models/User");

const protect = async (req, res, next) => {
  try {
    // First check session
    if (req.session && req.session.userId) {
      const user = await User.findById(req.session.userId);
      if (user) {
        req.user = user;
        return next();
      }
    }

    // If no session, check JWT
    let token;
    if (req.headers.authorization && req.headers.authorization.startsWith("Bearer")) {
      token = req.headers.authorization.split(" ")[1];
    }

    if (!token) {
      return res.status(401).json({ message: "Not authorized, no token" });
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.id);

      if (!user) {
        return res.status(401).json({ message: "User not found" });
      }

      if (!user.isActive) {
        return res.status(401).json({ message: "Account is deactivated" });
      }

      req.user = user;
      next();
    } catch (error) {
      console.error("JWT verification error:", error);
      return res.status(401).json({ message: "Not authorized, token failed" });
    }
  } catch (error) {
    console.error("Auth middleware error:", error);
    res.status(500).json({ message: "Server Error" });
  }
};

const admin = (req, res, next) => {
  if (req.user && req.user.role === "admin") {
    next();
  } else {
    res.status(401).json({ message: "Not authorized as admin" });
  }
};

module.exports = { protect, admin };
