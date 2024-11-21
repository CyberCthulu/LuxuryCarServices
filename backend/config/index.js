module.exports = {
  environment: process.env.NODE_ENV || 'development',
  port: process.env.PORT || 8000, // Default to port 8000 if not provided
  dbFile: process.env.DB_FILE || './backend/db/dev.sqlite', // Default SQLite file for development
  jwtConfig: {
    secret: process.env.JWT_SECRET || 'supersecret', // Default value for development
    expiresIn: process.env.JWT_EXPIRES_IN || '1h',   // Default to 1 hour
  },
};
