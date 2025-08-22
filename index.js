// Imports
const express = require("express");
const dotenv = require("dotenv");
const path = require("path");
const fileUpload = require("express-fileupload");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const session = require("express-session");
const MongoStore = require("connect-mongo");
const xss = require("xss-clean");
const { sanitizeMiddleware } = require("./middleware/sanitize");
const connectDB = require("./config/db");

// Load env vars
dotenv.config();

// Connect to database
connectDB();

// Create Express app
const app = express();

// Trust proxy (for Render and rate-limit)
app.set("trust proxy", 1);

// Middleware
app.use(express.json());
app.use(fileUpload({ createParentPath: true }));
app.use(express.static(path.join(__dirname, "uploads")));

// Security
app.use(helmet());
app.use(xss());
app.use(sanitizeMiddleware);

// CORS
const corsOptions = {
  origin: process.env.FRONTEND_URL || "http://localhost:5173",
  credentials: true,
};
const allowedOrigins = [
  "https://furniture-fe-eight.vercel.app",
  "https://furniture-fe-git-main-aasiskrks-projects.vercel.app",
  "https://furniture-5kp4z665b-aasiskrks-projects.vercel.app",
  "http://localhost:5173"
];

app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin) return callback(null, true); // allow non-browser requests like Postman
      if (allowedOrigins.indexOf(origin) !== -1) {
        callback(null, true);
      } else {
        callback(new Error("CORS not allowed"));
      }
    },
    credentials: true,
  })
);


// Rate limiting
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  message: { message: "Too many requests, try again later." },
});
app.use("/api/", apiLimiter);

// Sessions
app.use(
  session({
    secret: process.env.SESSION_SECRET || "secret-key",
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({ mongoUrl: process.env.MONGODB_URI }),
    cookie: { 
      secure: process.env.NODE_ENV === "production",
      httpOnly: true,
      sameSite: "lax",
      maxAge: 24 * 60 * 60 * 1000,
    },
  })
);

// Routes
app.use("/api/auth", require("./routes/authRoutes"));
app.use("/api/products", require("./routes/productRoutes"));
app.use("/api/cart", require("./routes/cartRoutes"));
app.use("/api/orders", require("./routes/orderRoutes"));
app.use("/api/admin", require("./routes/adminRoutes"));

// Basic route
app.get("/", (req, res) => {
  res.send("Furniture ecom API is running");
});

// Error handling
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ message: "Something went wrong!" });
});

// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

module.exports = app;
