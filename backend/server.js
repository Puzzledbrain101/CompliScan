// server.js - sample Express backend for OCR/scraping pipeline (demo)
// NOTE: This is a starter example. Replace mock parsing with real OCR / scraping.
const express = require('express');
const multer = require('multer');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { body, validationResult } = require('express-validator');
const mimeTypes = require('mime-types');
const { scrapeProduct } = require('./scrapers');
const fs = require('fs').promises;
const path = require('path');
const cors = require('cors');

// Import OCR processor and schema
const { processLabelImage } = require('./ocr-processor');
const { createNormalizedLabel, validateLabel } = require('./schema');
const { operations, initializeDatabase } = require('./database');

// Configure secure file upload with limits
const upload = multer({
  dest: 'uploads/',
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
    files: 1
  },
  fileFilter: (req, file, cb) => {
    const allowedMimes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only images are allowed.'), false);
    }
  }
});

const app = express();

// Trust proxy when behind reverse proxy (Replit environment)
app.set('trust proxy', 1);

// CORS: comma-separated CORS_ORIGINS overrides the default allow-list
const DEFAULT_CORS_ORIGINS = [
  'https://compliscan-blond.vercel.app',
  'https://compliscan-o505uw4t9-swayam-shahs-projects-9ce01a2a.vercel.app',
  'https://compliscan-79jw4lod7-swayam-shahs-projects-9ce01a2a.vercel.app',
  'https://compliscan-swayam-shahs-projects-9ce01a2a.vercel.app',
  'http://localhost:3000',
  'http://localhost:5000',
  'http://localhost:5173',
  'https://localhost:5000'
];
const corsOptions = {
  origin: process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(',').map(o => o.trim()).filter(Boolean)
    : DEFAULT_CORS_ORIGINS,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  optionsSuccessStatus: 200
};

// Apply CORS middleware
app.use(cors(corsOptions));

// Apply security headers
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      objectSrc: ["'none'"],
      upgradeInsecureRequests: []
    },
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  }
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: {
    error: 'Too many requests from this IP, please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

const checkLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // Limit check endpoint to 20 requests per windowMs
  message: {
    error: 'Too many compliance check requests, please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use(limiter);
app.use('/api/check', checkLimiter);

app.use(express.json({ limit: '10mb' })); // Prevent large JSON payloads
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Utility function to clean up uploaded files
async function cleanupFile(filePath) {
  try {
    if (filePath && await fs.access(filePath).then(() => true).catch(() => false)) {
      await fs.unlink(filePath);
    }
  } catch (error) {
    console.error('Error cleaning up file:', error.message);
  }
}

// Sanitize error messages to prevent information disclosure
function sanitizeError(error, isProduction = process.env.NODE_ENV === 'production') {
  if (isProduction) {
    // In production, return generic error messages
    if (error.message.includes('validation') || error.message.includes('Invalid')) {
      return 'Invalid input provided';
    }
    if (error.message.includes('network') || error.message.includes('timeout')) {
      return 'Network error occurred';
    }
    return 'An error occurred while processing your request';
  }
  // In development, return the actual error (but still sanitize sensitive info)
  return error.message.replace(/file:\/\/[^\s]+/g, '[FILE_PATH]').replace(/https?:\/\/[^\s]+/g, '[URL]');
}

app.post('/api/check', 
  // Input validation middleware
  [
    body('url').optional().isURL({ protocols: ['http', 'https'], require_protocol: true })
      .withMessage('Invalid URL format'),
    body('url').optional().isLength({ max: 2048 })
      .withMessage('URL too long')
  ],
  upload.single('image'), 
  async (req, res) => {
    let uploadedFilePath = null;
    const startTime = Date.now(); // Track processing time
    
    try {
      // Check for validation errors
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ 
          error: 'Validation failed',
          details: errors.array().map(err => err.msg)
        });
      }

      const imageFile = req.file;
      const { url } = req.body;
      uploadedFilePath = imageFile?.path;

      // Validate that we have either URL or image
      if (!url && !imageFile) {
        return res.status(400).json({ error: 'Provide either image file or url' });
      }

      if (url && imageFile) {
        return res.status(400).json({ error: 'Provide either image file or url, not both' });
      }

      let parsed;
      if (url) {
        // Additional URL sanitization
        const sanitizedUrl = url.trim();
        if (sanitizedUrl.length > 2048) {
          throw new Error('URL too long');
        }
        parsed = await scrapeProduct(sanitizedUrl);
      } else if (imageFile) {
        // Validate file type again (defense in depth)
        const detectedType = mimeTypes.lookup(imageFile.originalname);
        const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
        
        if (!allowedTypes.includes(imageFile.mimetype) && !allowedTypes.includes(detectedType)) {
          throw new Error('Invalid file type');
        }

        // Process image with real OCR
        console.log('Processing image with OCR:', imageFile.originalname);
        parsed = await processLabelImage(imageFile.path);
      }

      // Required fields and scoring live in schema.js (createNormalizedLabel)
      const isImageSource = parsed._ocr_source === 'image';

      const reasons = [];
      if (parsed._ocr_confidence && parsed._ocr_confidence < 0.6) {
        reasons.push('Low OCR confidence');
      }
      if (parsed._image_resolution && 
          (parsed._image_resolution.width < 400 || parsed._image_resolution.height < 300)) {
        reasons.push('Low image resolution');
      }

      // Create normalized label using schema
      const normalizedLabel = createNormalizedLabel(parsed, {
        source: isImageSource ? 'image' : 'url',
        fieldConfidences: parsed._field_confidences || {},
        ocrConfidence: parsed._ocr_confidence || 0,
        imageResolution: parsed._image_resolution,
        extractedText: parsed._extracted_text,
        debugInfo: { 
          inputType: imageFile ? 'image' : 'url',
          url: url || 'N/A',
          fileName: imageFile?.originalname || 'N/A'
        }
      });

      // Validate normalized label structure
      const validation = validateLabel(normalizedLabel);
      if (!validation.valid && process.env.NODE_ENV !== 'production') {
        console.warn('Schema validation errors:', validation.errors);
      }

      // Add legacy compatibility fields for frontend
      const log = {
        id: `check_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        parsed: {
          product_name: normalizedLabel.product_name,
          MRP: normalizedLabel.MRP,
          manufacturer: normalizedLabel.manufacturer,
          net_quantity: normalizedLabel.net_quantity,
          country_of_origin: normalizedLabel.country_of_origin,
          consumer_care: normalizedLabel.consumer_care,
          date_of_manufacture: normalizedLabel.date_of_manufacture,
          _ocr_confidence: normalizedLabel._ocr_confidence,
          _image_resolution: normalizedLabel._image_resolution,
          _field_confidences: normalizedLabel._field_confidences
        },
        compliance_score: normalizedLabel.compliance_score,
        status: normalizedLabel.status,
        violations: normalizedLabel.violations.map(v => v.message),
        unverifiable: normalizedLabel.unverifiable_fields.map(u => u.message),
        issues: normalizedLabel.violations, // { field, type, severity, message }
        unverifiable_fields: normalizedLabel.unverifiable_fields, // { field, message }
        reasons: reasons, // Keep quality reasons separate
        timestamp: normalizedLabel._timestamp,
        // Include full normalized data for future use
        _normalized: normalizedLabel
      };

      // Clean up uploaded file
      if (uploadedFilePath) {
        await cleanupFile(uploadedFilePath);
      }

      // Store submission in database
      try {
        const submissionData = {
          id: log.id,
          user_id: 'demo_user',
          product_name: normalizedLabel.product_name,
          input_type: req.file ? 'image' : 'url',
          input_source: req.file ? req.file.originalname : (req.body.url || null),
          
          // Legal Metrology fields
          manufacturer: normalizedLabel.manufacturer,
          net_quantity: normalizedLabel.net_quantity,
          mrp: normalizedLabel.MRP,
          consumer_care: normalizedLabel.consumer_care,
          date_of_manufacture: normalizedLabel.date_of_manufacture,
          country_of_origin: normalizedLabel.country_of_origin,
          
          // Compliance results
          compliance_score: normalizedLabel.compliance_score,
          status: ['approved', 'failed', 'needs_review'].includes(normalizedLabel.status) 
            ? normalizedLabel.status 
            : 'needs_review', // Default fallback for unknown status
          
          // Technical metadata
          ocr_confidence: normalizedLabel._ocr_confidence,
          image_width: normalizedLabel._image_resolution?.width,
          image_height: normalizedLabel._image_resolution?.height,
          processing_time_ms: Date.now() - startTime,
          
          // Raw data
          raw_data: normalizedLabel,
          field_confidences: normalizedLabel._field_confidences,
          extracted_text: normalizedLabel._extracted_text
        };

        // Store submission (await here!)
        await operations.insertSubmission(submissionData);

        // Store violations separately
        if (normalizedLabel.violations && normalizedLabel.violations.length > 0) {
          await operations.insertViolations(log.id, normalizedLabel.violations);
        }

        console.log('Submission stored in database:', log.id);
      } catch (dbError) {
        console.error('Failed to store submission in database:', dbError);
        // Continue without failing the request - database storage is not critical for immediate response
      }

      return res.json(log);
    } catch (err) {
      // Clean up uploaded file on error
      if (uploadedFilePath) {
        await cleanupFile(uploadedFilePath);
      }
      
      console.error('Compliance check error:', {
        message: err.message,
        stack: process.env.NODE_ENV !== 'production' ? err.stack : undefined,
        timestamp: new Date().toISOString()
      });
      
      // Scraper errors carry a message written for the user
      const sanitizedError = err.expose ? err.message : sanitizeError(err);
      const statusCode = err.expose ? err.status
        : err.message.includes('validation') || err.message.includes('Invalid') ? 400 : 500;
      
      res.status(statusCode).json({ 
        error: sanitizedError,
        timestamp: new Date().toISOString()
      });
    }
  }
);

// SQLite CURRENT_TIMESTAMP is UTC without a zone ("YYYY-MM-DD HH:MM:SS")
function toIsoUtc(sqliteTimestamp) {
  if (!sqliteTimestamp) return null;
  return sqliteTimestamp.includes('T') ? sqliteTimestamp : `${sqliteTimestamp.replace(' ', 'T')}Z`;
}

// Shape a stored submission like the /api/check response so the frontend
// can render history entries and fresh results the same way
function formatSubmission(sub) {
  const raw = sub.raw_data || {};
  return {
    id: sub.id,
    product_preview: sub.product_name || 'Unknown product',
    input_type: sub.input_type,
    input_source: sub.input_source,
    parsed: {
      product_name: sub.product_name,
      MRP: raw.MRP,
      manufacturer: raw.manufacturer,
      net_quantity: raw.net_quantity,
      country_of_origin: raw.country_of_origin,
      consumer_care: raw.consumer_care,
      date_of_manufacture: raw.date_of_manufacture,
      _ocr_confidence: raw._ocr_confidence,
      _image_resolution: raw._image_resolution,
      _field_confidences: sub.field_confidences
    },
    compliance_score: sub.compliance_score,
    status: sub.status,
    violations: (raw.violations || []).map(v => v.message),
    unverifiable: (raw.unverifiable_fields || []).map(u => u.message),
    issues: raw.violations || [],
    unverifiable_fields: raw.unverifiable_fields || [],
    reasons: [],
    timestamp: toIsoUtc(sub.created_at),
    highlight: sub.status !== 'approved'
  };
}

// Get submission history
app.get('/api/submissions', async (req, res) => {
  try {
    const { user_id = 'demo_user' } = req.query;
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 200);
    const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);
    const submissions = await operations.getSubmissions(user_id, limit, offset);
    const formattedSubmissions = submissions.map(formatSubmission);

    res.json({
      submissions: formattedSubmissions,
      total: formattedSubmissions.length,
      has_more: formattedSubmissions.length === limit
    });
  } catch (error) {
    console.error('Failed to get submissions:', error);
    res.status(500).json({ error: 'Failed to retrieve submissions' });
  }
});

// Get single submission with full details
app.get('/api/submissions/:id', async (req, res) => {
  try {
    const submission = await operations.getSubmissionById(req.params.id);
    if (!submission) {
      return res.status(404).json({ error: 'Submission not found' });
    }
    const violationDetails = await operations.getViolationsBySubmissionId(req.params.id);

    res.json({ ...formatSubmission(submission), violation_details: violationDetails });
  } catch (error) {
    console.error('Failed to get submission:', error);
    res.status(500).json({ error: 'Failed to retrieve submission' });
  }
});

// Analytics endpoints
app.get('/api/analytics/trend', async (req, res) => {
  try {
    const { days = 30, user_id = 'demo_user' } = req.query;
    const trendData = await operations.getComplianceTrend(user_id, parseInt(days));
    
    // Transform for recharts format
    const formatted = trendData.map((item) => ({
      x: item.date,
      compliance: Math.round(item.avg_score || 0),
      date: item.date,
      submissions: item.submissions || 0
    }));

    res.json(formatted);
  } catch (error) {
    console.error('Failed to get trend data:', error);
    res.status(500).json({ error: 'Failed to retrieve trend data' });
  }
});

app.get('/api/analytics/brands', async (req, res) => {
  try {
    const { limit = 10, user_id = 'demo_user' } = req.query;
    const brandData = await operations.getViolationsByBrand(user_id, parseInt(limit));
    
    // Transform for recharts format
    const formatted = brandData.map(item => ({
      brand: item.brand || 'Unknown',
      violations: item.total_violations || 0,
      submissions: item.total_submissions || 0,
      avg_score: Math.round(item.avg_score || 0)
    }));

    res.json(formatted);
  } catch (error) {
    console.error('Failed to get brand data:', error);
    res.status(500).json({ error: 'Failed to retrieve brand data' });
  }
});

app.get('/api/analytics/stats', async (req, res) => {
  try {
    const { user_id = 'demo_user' } = req.query;
    const stats = await operations.getOverallStats(user_id);
    res.json(stats);
  } catch (error) {
    console.error('Failed to get stats:', error);
    res.status(500).json({ error: 'Failed to retrieve stats' });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', {
    message: err.message,
    stack: process.env.NODE_ENV !== 'production' ? err.stack : undefined,
    timestamp: new Date().toISOString()
  });
  
  const sanitizedError = sanitizeError(err);
  res.status(500).json({ 
    error: sanitizedError,
    timestamp: new Date().toISOString()
  });
});

const PORT = process.env.PORT || 8000;
initializeDatabase()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
      console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`Security headers enabled: ${process.env.NODE_ENV === 'production' ? 'Yes' : 'Development mode'}`);
    });
  })
  .catch((err) => {
    console.error('Failed to initialize database, exiting:', err);
    process.exit(1);
  });