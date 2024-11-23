const express = require('express');
const router = express.Router();
const apiRouter = require('./api');

// **Use the API Router for All /api Routes**
router.use('/api', apiRouter);

// **Development-Only Test Route**
if (process.env.NODE_ENV !== 'production') {
  router.get('/hello/world', (req, res) => {
    res.cookie('XSRF-TOKEN', req.csrfToken()); // Set CSRF token in cookies
    res.status(200).json({ message: 'Hello World!' });
  });
}

// **Root Route for the API**
router.get('/', (req, res) => {
  res.status(200).json({
    message: 'Welcome to the Luxury Car Service API!',
    status: 'Running'
  });
});

// **Route to Restore CSRF Token (Development Only)**
router.get('/api/csrf/restore', (req, res) => {
  try {
    console.log('CSRF route hit'); // Debugging log
    const csrfToken = req.csrfToken(); // Generate CSRF token
    res.cookie('XSRF-TOKEN', csrfToken);
    res.status(200).json({ 'XSRF-Token': csrfToken });
  } catch (error) {
    console.error('Error generating CSRF token:', error);
    res.status(500).json({ message: 'Failed to generate CSRF token' });
  }
});

// Temporary test route for CSRF testing
router.post('/api/test', (req, res) => {
  return res.json({ requestBody: req.body });
});


module.exports = router;