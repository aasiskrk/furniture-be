// Import packages
const express = require("express");
const dotenv = require("dotenv");
const connectDB = require("./config/db");
const cors = require("cors");
const fileUpload = require("express-fileupload");
const session = require("express-session");
const MongoStore = require("connect-mongo");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const xss = require("xss-clean");
const path = require("path");
const { sanitizeMiddleware } = require("./middleware/sanitize");

// Load env
dotenv.config();

// Connect to DB
connectDB();

// Create app
const app = express();
app.set("trust proxy", 1); // Important for Render proxy (IP + secure cookies)

// JSON + file upload
app.use(express.json());
app.use(fileUpload({ createParentPath: true }));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// CORS
app.use(
  cors({
    origin: process.env.FRONTEND_URL || "http://localhost:5173",
    credentials: true,
  })
);

// Security
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
  })
);
app.use(xss());

// Rate limiting
app.use(
  "/api/",
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: { message: "Too many requests, please try again later." },
  })
);

// Sessions
app.use(
  session({
    secret: process.env.SESSION_SECRET || "your-secret-key",
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
      mongoUrl: process.env.MONGODB_URI,
      ttl: 24 * 60 * 60, // 1 day
    }),
    cookie: {
      secure: process.env.NODE_ENV === "production", // only secure on Render
      httpOnly: true,
      sameSite: "lax",
      maxAge: 24 * 60 * 60 * 1000,
    },
  })
);

// Sanitization
app.use(sanitizeMiddleware);

// Routes
app.use("/api/user", require("./routes/userRoutes"));
app.use("/api/forum", require("./routes/forumRoutes"));
app.use("/api/game", require("./routes/gameRoutes"));

// Root route
app.get("/", (req, res) => {
  res.send("API is running 🚀");
});

// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});

module.exports = app;
