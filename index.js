const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const fileUpload = require("express-fileupload");
const path = require("path");
const connectDB = require("./config/db");
const session = require("express-session");
const MongoStore = require("connect-mongo");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const { sanitizeMiddleware } = require("./middleware/sanitize");
const xss = require("xss-clean");
const https = require("https");
const fs = require("fs");

// Load env vars
dotenv.config();

// Connect to database
connectDB();

const app = express();

// Rate limiting
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: { message: "Too many requests, please try again later." },
});

// Apply rate limiting to all routes
app.use("/api/", apiLimiter);

// Security middleware with custom configuration
app.use(
  helmet({
    crossOriginResourcePolicy: {
      policy: "cross-origin",
    },
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "blob:", "*"],
        connectSrc: [
          "'self'",
          process.env.FRONTEND_URL || "http://localhost:5173",
        ],
      },
    },
  })
);

// Middleware
app.use(
  cors({
    origin: process.env.FRONTEND_URL || "http://localhost:5173",
    credentials: true,
  })
);
app.use(express.json());

// Session configuration with enhanced security
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
      secure: process.env.NODE_ENV === "production", // only secure in production
      httpOnly: true,
      sameSite: "lax",
      maxAge: 24 * 60 * 60 * 1000, // 1 day
      path: "/",
    },
    rolling: true,
    name: "sessionId",
  })
);

app.use(
  fileUpload({
    createParentPath: true,
    limits: {
      fileSize: 10 * 1024 * 1024, // 10MB max file size
    },
    useTempFiles: true,
    tempFileDir: path.join(__dirname, "tmp"),
    debug: process.env.NODE_ENV === "development",
    safeFileNames: true,
    preserveExtension: true,
    abortOnLimit: true,
    uploadTimeout: 30000,
  })
);

// Custom middleware to validate file types
app.use((req, res, next) => {
  if (!req.files) return next();

  const allowedTypes = ["image/jpeg", "image/jpg", "image/png"];
  const files = req.files.pictures
    ? Array.isArray(req.files.pictures)
      ? req.files.pictures
      : [req.files.pictures]
    : [];

  for (const file of files) {
    if (!allowedTypes.includes(file.mimetype)) {
      return res.status(400).json({
        message: "Invalid file type. Only JPG, JPEG and PNG files are allowed.",
      });
    }
  }
  next();
});

// XSS Protection
app.use(xss());

// Serve static files from uploads directory
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// Apply sanitization middleware before routes
app.use(sanitizeMiddleware);

// Routes
app.use("/api/auth", require("./routes/authRoutes"));
app.use("/api/products", require("./routes/productRoutes"));
app.use("/api/cart", require("./routes/cartRoutes"));
app.use("/api/orders", require("./routes/orderRoutes"));
app.use("/api/admin", require("./routes/adminRoutes"));

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ message: "Something went wrong!" });
});

// Basic route
app.get("/", (req, res) => {
  res.send("Furniture ecom API is running");
});

const PORT = process.env.PORT || 5000;

// ===== Server start =====
if (process.env.NODE_ENV === "production") {
  // On Render → plain HTTP (Render already provides HTTPS)
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
} else {
  // Local dev → HTTPS with self-signed certs
  const certsDir = path.join(__dirname, "certs");
  if (!fs.existsSync(certsDir)) {
    fs.mkdirSync(certsDir);
    const { exec } = require("child_process");
    const command = `openssl req -x509 -newkey rsa:4096 -keyout ${path.join(
      certsDir,
      "key.pem"
    )} -out ${path.join(
      certsDir,
      "cert.pem"
    )} -days 365 -nodes -subj "/CN=localhost"`;
    exec(command, (error) => {
      if (error) console.error("Error generating certificates:", error);
      else console.log("SSL certificates generated successfully!");
    });
  }

  const httpsOptions = {
    key: fs.readFileSync(path.join(certsDir, "key.pem")),
    cert: fs.readFileSync(path.join(certsDir, "cert.pem")),
  };

  https.createServer(httpsOptions, app).listen(PORT, () => {
    console.log(`Secure server running on https://localhost:${PORT}`);
  });
}
