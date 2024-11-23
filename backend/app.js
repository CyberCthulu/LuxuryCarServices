const express = require('express');
require('express-async-errors'); // To catch async route errors
const morgan = require('morgan'); // Logging HTTP requests
const cors = require('cors'); // Cross-Origin Resource Sharing
const csurf = require('csurf'); // CSRF protection
const helmet = require('helmet'); // Security middleware
const cookieParser = require('cookie-parser'); // Cookie parsing
const { restoreUser } = require('./utils/auth'); // Restore user session
const { ValidationError } = require('sequelize'); // Sequelize error handler

const { environment } = require('./config');
const isProduction = environment === 'production';

// Initialize Express app
const app = express();

// Setup logger middleware
app.use(morgan('dev'));

// Middleware for parsing cookies and JSON requests
app.use(cookieParser());
app.use(express.json());

// Enable CORS only in development
if (!isProduction) {
  app.use(cors());
}

// Apply security headers with Helmet
app.use(
  helmet.crossOriginResourcePolicy({
    policy: 'cross-origin',
  })
);

// Initialize CSRF protection
app.use(
  csurf({
    cookie: {
      secure: isProduction, // Secure cookies in production
      sameSite: isProduction ? 'Lax' : 'Strict', // Cross-site handling
      httpOnly: true, // Prevent JavaScript access to cookies
    },
  })
);

// Middleware to include CSRF token in responses (after CSRF initialization)
// app.use((req, res, next) => {
//   try {
//     const csrfToken = req.csrfToken(); // Generate CSRF token
//     res.cookie('XSRF-TOKEN', csrfToken); // Set token in cookie
//     res.locals.csrfToken = csrfToken; // Optional: Use in templates
//     next();
//   } catch (error) {
//     console.error('CSRF Token Error:', error); // Handle CSRF errors gracefully
//     next(error);
//   }
// });

// Restore user session
app.use(restoreUser);

// Import and apply routes
const routes = require('./routes');
app.use(routes);

// Handle 404 errors for unhandled requests
app.use((_req, _res, next) => {
  const err = new Error("The requested resource couldn't be found.");
  err.title = 'Resource Not Found';
  err.errors = { message: "The requested resource couldn't be found." };
  err.status = 404;
  next(err);
});

// Handle Sequelize validation errors
app.use((err, _req, _res, next) => {
  if (err instanceof ValidationError) {
    const errors = {};
    err.errors.forEach((error) => {
      errors[error.path] = error.message;
    });
    err.title = 'Validation Error';
    err.errors = errors;
  }
  next(err);
});

app.use((err, _req, res, _next) => {
  res.status(err.status || 500);
  console.error(err);
  res.json({
    title: err.title || 'Server Error',
    message: err.message,
    errors: err.errors,
    stack: isProduction ? null : err.stack
  });
});

// Export the Express app
module.exports = app;
