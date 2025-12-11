const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const routes = require('./routes');

const app = express();

// Security Headers
app.use(helmet());

// CORS Configuration
const frontendUrl = process.env.FRONTEND_URL || '*';
app.use(cors({
  origin: frontendUrl,
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Rate Limiting (Prevent abuse of AI tokens)
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: "Too many requests from this IP, please try again later."
});
app.use(limiter);

// Body Parser
app.use(express.json({ limit: '10mb' })); // Increased limit for image uploads

// Routes
app.use('/api', routes);

// Health Check for Cloud Run
app.get('/', (req, res) => {
  res.status(200).send('The Bridge API is operational.');
});

module.exports = app;