// server.js - sample Express backend for OCR/scraping pipeline (demo)
// NOTE: This is a starter example. Replace mock parsing with real OCR / scraping.
const express = require('express');
const multer = require('multer');
const axios = require('axios');
const cheerio = require('cheerio');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { body, validationResult } = require('express-validator');
const mimeTypes = require('mime-types');
const dns = require('dns').promises;
const fs = require('fs').promises;
const path = require('path');

// Import OCR processor and schema
const { processLabelImage } = require('./ocr-processor');
const { createNormalizedLabel, validateLabel } = require('./schema');
const { operations } = require('./database');

// Initialize OpenAI client (optional - only if API key provided)
// the newest OpenAI model is "gpt-5" which was released August 7, 2025. do not change this unless explicitly requested by the user
const OpenAI = require('openai');
let openai = null;

if (process.env.OPENAI_API_KEY) {
  openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  console.log('OpenAI client initialized successfully');
} else {
  console.log('OpenAI API key not provided. AI features will be disabled.');
}

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

// Configure CORS to be more restrictive and production-ready
const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
   const allowedOrigins = process.env.NODE_ENV === 'production'
  ? [
      'https://compliscan-o505uw4t9-swayam-shahs-projects-9ce01a2a.vercel.app', // ADDED THIS LINE
      'https://compliscan-blond.vercel.app',
      'https://compliscan-79jw4lod7-swayam-shahs-projects-9ce01a2a.vercel.app',
      'https://compliscan-swayam-shahs-projects-9ce01a2a.vercel.app',
      process.env.FRONTEND_URL,
      process.env.DOMAIN ? `https://${process.env.DOMAIN}` : null,
      'https://localhost:5000' // Replit preview
    ].filter(Boolean)
  : [
      'http://localhost:5000',
      'https://localhost:5000',
      /^https:\/\/.*\.replit\.dev$/,
      /^https:\/\/.*\.repl\.co$/
    ];
    
    const isAllowed = allowedOrigins.some(allowedOrigin => {
      if (typeof allowedOrigin === 'string') {
        return origin === allowedOrigin;
      }
      if (allowedOrigin instanceof RegExp) {
        return allowedOrigin.test(origin);
      }
      return false;
    });
    
    if (isAllowed) {
      callback(null, true);
    } else {
      console.warn(`CORS blocked origin: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  optionsSuccessStatus: 200,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  exposedHeaders: ['X-RateLimit-Limit', 'X-RateLimit-Remaining']
};

app.use(express.json({ limit: '10mb' })); // Prevent large JSON payloads
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Enhanced URL validation to prevent SSRF with DNS resolution checks
async function validateUrl(url) {
  try {
    const parsedUrl = new URL(url);
    
    // Only allow http and https protocols
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      throw new Error('Only HTTP and HTTPS protocols are allowed');
    }
    
    const hostname = parsedUrl.hostname.toLowerCase();
    
    // Block private IP ranges and localhost (initial check)
    const privatePatterns = [
      /^127\./, // 127.x.x.x (localhost)
      /^10\./, // 10.x.x.x (private)
      /^172\.(1[6-9]|2[0-9]|3[0-1])\./, // 172.16.x.x - 172.31.x.x (private)
      /^192\.168\./, // 192.168.x.x (private)
      /^169\.254\./, // 169.254.x.x (link-local)
      /^::1$/, // IPv6 localhost
      /^fc00:/, // IPv6 private
      /^fe80:/, // IPv6 link-local
      /localhost/i,
      /\.local$/i,
      /^metadata\./, // AWS metadata
      /^169\.254\.169\.254$/, // AWS metadata IP
    ];
    
    if (privatePatterns.some(pattern => pattern.test(hostname))) {
      throw new Error('Access to private IP ranges is not allowed');
    }
    
    // DNS resolution check to prevent DNS rebinding attacks
    try {
      const addresses = await dns.resolve4(hostname).catch(() => []);
      const addresses6 = await dns.resolve6(hostname).catch(() => []);
      const allAddresses = [...addresses, ...addresses6];
      
      for (const addr of allAddresses) {
        if (privatePatterns.some(pattern => pattern.test(addr))) {
          throw new Error('Domain resolves to private IP address');
        }
        // Additional specific IP blocks
        if (addr.startsWith('0.') || addr === '255.255.255.255') {
          throw new Error('Invalid IP address range');
        }
      }
    } catch (dnsError) {
      if (dnsError.message.includes('private IP') || dnsError.message.includes('Invalid IP')) {
        throw dnsError;
      }
      // DNS resolution failed, allow but log
      console.warn(`DNS resolution failed for ${hostname}: ${dnsError.message}`);
    }
    
    return true;
  } catch (error) {
    throw new Error(`URL validation failed: ${error.message}`);
  }
}

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

// Enhanced function to extract structured data (JSON-LD, OpenGraph) with Flipkart support
function extractStructuredData($) {
  const data = {};
  
  // Try JSON-LD first (most reliable for e-commerce)
  $('script[type="application/ld+json"]').each((i, el) => {
    try {
      const jsonText = $(el).html().trim();
      if (!jsonText) return;
      
      const jsonData = JSON.parse(jsonText);
      
      // Handle array of JSON-LD objects
      const schemas = Array.isArray(jsonData) ? jsonData : [jsonData];
      
      for (const schema of schemas) {
        // Standard Product schema
        if (schema['@type'] === 'Product') {
          data.product_name = data.product_name || schema.name;
          data.price = data.price || schema.offers?.price || schema.offers?.[0]?.price;
          data.manufacturer = data.manufacturer || schema.brand?.name || schema.manufacturer?.name;
          data.net_quantity = data.net_quantity || schema.weight?.value || schema.size;
          data.country_of_origin = data.country_of_origin || schema.countryOfOrigin;
        }
        
        // BreadcrumbList can contain product info
        if (schema['@type'] === 'BreadcrumbList' && schema.itemListElement) {
          const productBreadcrumb = schema.itemListElement.find(item => 
            item.item && item.item.name && !item.item.name.includes('Home') && !item.item.name.includes('Category')
          );
          if (productBreadcrumb && !data.product_name) {
            data.product_name = productBreadcrumb.item.name;
          }
        }
        
        // WebPage or WebSite can contain product details
        if ((schema['@type'] === 'WebPage' || schema['@type'] === 'WebSite') && schema.mainEntity) {
          const mainEntity = schema.mainEntity;
          if (mainEntity['@type'] === 'Product') {
            data.product_name = data.product_name || mainEntity.name;
            data.price = data.price || mainEntity.offers?.price || mainEntity.offers?.[0]?.price;
            data.manufacturer = data.manufacturer || mainEntity.brand?.name || mainEntity.manufacturer?.name;
          }
        }
        
        // Flipkart-specific: Organization schema sometimes contains brand info
        if (schema['@type'] === 'Organization' && schema.name && !data.manufacturer) {
          // Only use if it looks like a brand name (not "Flipkart")
          if (!schema.name.toLowerCase().includes('flipkart')) {
            data.manufacturer = schema.name;
          }
        }
      }
    } catch (e) {
      console.log('JSON-LD parsing error:', e.message);
      // Continue to next script tag
    }
  });
  
  // Enhanced OpenGraph/meta tag extraction
  if (!data.product_name) {
    data.product_name = $('meta[property="og:title"]').attr('content') ||
                       $('meta[name="title"]').attr('content') ||
                       $('meta[property="og:site_name"]').attr('content');
  }
  
  if (!data.price) {
    const priceAmount = $('meta[property="product:price:amount"]').attr('content') ||
                       $('meta[name="price"]').attr('content');
    // Only use price amount, not currency code
    if (priceAmount && /\d/.test(priceAmount)) {
      data.price = priceAmount;
    }
  }
  
  if (!data.manufacturer) {
    data.manufacturer = $('meta[property="product:brand"]').attr('content') ||
                       $('meta[name="brand"]').attr('content') ||
                       $('meta[property="og:brand"]').attr('content');
  }
  
  // Additional meta tag checks for Flipkart
  if (!data.net_quantity) {
    data.net_quantity = $('meta[name="weight"]').attr('content') ||
                       $('meta[property="product:weight"]').attr('content');
  }
  
  if (!data.country_of_origin) {
    data.country_of_origin = $('meta[name="origin"]').attr('content') ||
                            $('meta[property="product:origin"]').attr('content');
  }
  
  console.log('Structured data extracted:', Object.keys(data).filter(k => data[k]));
  return data;
}

// AI-powered field normalization and enhancement
async function normalizeProductData(data) {
  if (!openai || !process.env.OPENAI_API_KEY) {
    console.log('OpenAI not configured, skipping AI normalization');
    return { ...data, ai_confidence: 0 };
  }

  try {
    const prompt = `Analyze and normalize this e-commerce product data. Extract missing fields, standardize units, and clean up the information. Return JSON with normalized data and confidence scores.

Product Data:
${JSON.stringify(data, null, 2)}

Rules:
1. Clean and standardize product names (remove excessive marketing text)
2. Extract numeric MRP/price with currency (₹ for Indian sites)
3. Standardize manufacturer/brand names (canonical forms)
4. Normalize net_quantity with proper units (g, kg, ml, l, pieces)
5. Standardize country_of_origin (full country names)
6. Add confidence score (0-1) for each field

Return JSON in this exact format:
{
  "product_name": "cleaned name",
  "MRP": "₹amount",
  "manufacturer": "Brand Name",
  "net_quantity": "amount unit",
  "country_of_origin": "Country Name",
  "confidence": {
    "product_name": 0.9,
    "MRP": 0.8,
    "manufacturer": 0.9,
    "net_quantity": 0.7,
    "country_of_origin": 0.6
  },
  "ai_enhanced": true
}`;

    const response = await openai.chat.completions.create({
      model: "gpt-5",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      temperature: 0.3
    });

    const aiResult = JSON.parse(response.choices[0].message.content);
    
    // Merge AI results with original data, preferring AI when confidence > 0.7
    const normalized = { ...data };
    for (const [key, value] of Object.entries(aiResult)) {
      if (key === 'confidence' || key === 'ai_enhanced') continue;
      if (value && (!data[key] || aiResult.confidence?.[key] > 0.7)) {
        normalized[key] = value;
      }
    }
    
    normalized.ai_confidence = aiResult.confidence || {};
    normalized.ai_enhanced = true;
    
    return normalized;
  } catch (error) {
    console.log('AI normalization failed:', error.message);
    return { ...data, ai_confidence: {}, ai_enhanced: false };
  }
}

// AI-powered compliance explanation generator
async function generateComplianceExplanation(violations, productData) {
  if (!openai || !process.env.OPENAI_API_KEY || violations.length === 0) {
    return null;
  }

  try {
    const prompt = `Generate clear, helpful explanations for Legal Metrology compliance violations. Make it easy to understand and actionable.

Product: ${productData.product_name || 'Unknown Product'}
Violations: ${violations.join(', ')}

For each violation, explain:
1. What's missing/wrong
2. Why it's required by Indian Legal Metrology rules
3. How to fix it (specific steps)

Keep explanations under 120 words total. Be helpful, not technical. Return JSON format:
{
  "explanation": "Clear explanation of what's wrong and how to fix",
  "severity": "low|medium|high",
  "confidence": 0.9
}`;

    const response = await openai.chat.completions.create({
      model: "gpt-5",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      temperature: 0.4
    });

    return JSON.parse(response.choices[0].message.content);
  } catch (error) {
    console.log('AI explanation failed:', error.message);
    return null;
  }
}

// Enhanced generic extraction functions
function getGenericProductName($) {
  return ($('h1').first().text() ||
          $('[class*="title"]').first().text() ||
          $('[id*="title"]').first().text() ||
          $('[data-testid*="title"]').first().text() ||
          $('.product-name').text() ||
          $('.item-title').text()).trim() || null;
}

function getGenericPrice($) {
  return ($('[class*="price"]').first().text() ||
          $('[id*="price"]').first().text() ||
          $('[data-testid*="price"]').first().text() ||
          $('.cost').text() ||
          $('.amount').text()).trim() || null;
}

function getGenericManufacturer($) {
  return ($('[class*="brand"]').first().text() ||
          $('[class*="manufacturer"]').first().text() ||
          $('[data-testid*="brand"]').first().text() ||
          $('.company').text() ||
          $('.maker').text()).trim() || null;
}

function getGenericQuantity($) {
  return ($('[class*="quantity"]').first().text() ||
          $('[class*="weight"]').first().text() ||
          $('[class*="size"]').first().text() ||
          $('span:contains("g"), span:contains("kg"), span:contains("ml"), span:contains("l")').first().text()).trim() || null;
}

function getGenericCountryOfOrigin($) {
  return ($('[class*="origin"]').first().text() ||
          $('.country').text() ||
          $('*:contains("Made in")').first().text()).trim() || null;
}

// Enhanced scrape function with better security and error handling
async function scrapeProduct(url) {
  await validateUrl(url);
  
  // Detect platform and adjust settings
  const isFlipkart = url.includes('flipkart.com');
  const isAmazon = url.includes('amazon.') || url.includes('amzn.');
  const isMyntra = url.includes('myntra.com');
  const isNykaa = url.includes('nykaa.com');
  
  // Advanced User-Agent rotation for stealth scraping
  const userAgents = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.4 Safari/605.1.15',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/121.0',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36 Edg/123.0.0.0'
  ];
  
  const randomUserAgent = userAgents[Math.floor(Math.random() * userAgents.length)];
  
  // Enhanced stealth headers to mimic real browser behavior
  const headers = {
    'User-Agent': randomUserAgent,
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
    'Accept-Language': 'en-US,en;q=0.9,hi-IN;q=0.8,hi;q=0.7,mr;q=0.6',
    'Accept-Encoding': 'gzip, deflate, br',
    'Cache-Control': 'max-age=0',
    'Sec-Ch-Ua': '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
    'Sec-Ch-Ua-Mobile': '?0',
    'Sec-Ch-Ua-Platform': '"Windows"',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none',
    'Sec-Fetch-User': '?1',
    'Upgrade-Insecure-Requests': '1',
    'Connection': 'keep-alive',
    'DNT': '1'
  };
  
  // Add platform-specific stealth headers
  if (isFlipkart) {
    headers['Referer'] = 'https://www.flipkart.com/';
    headers['Origin'] = 'https://www.flipkart.com';
    headers['X-User-Agent'] = `${randomUserAgent} FKUA/website/42/website/Desktop`;
    headers['X-Requested-With'] = 'XMLHttpRequest';
  } else if (isMyntra) {
    headers['Referer'] = 'https://www.myntra.com/';
    headers['Origin'] = 'https://www.myntra.com';
    headers['X-Myntra-App'] = 'desktop';
    headers['X-Requested-With'] = 'XMLHttpRequest';
  }
  
  
  const { data } = await axios.get(url, { 
    timeout: (isFlipkart || isMyntra) ? 15000 : 8000, // Longer timeout for problematic sites
    maxContentLength: 3 * 1024 * 1024, // 3MB limit
    maxRedirects: 3,
    headers,
    validateStatus: function (status) {
      return status >= 200 && status < 400; // Accept 2xx and 3xx status codes
    }
  });
  
  // Debug logging for problematic sites
  if (isMyntra && data.includes('Something went wrong')) {
    console.log('Myntra returned error page, likely bot detection');
  }
  
  const $ = cheerio.load(data);
  
  // Enhanced extraction with site-specific selectors
  let product_name = null;
  let price = null;
  let net_quantity = null;
  let manufacturer = null;
  let country_of_origin = null;
  
  // First try to extract from structured data (JSON-LD, OpenGraph)
  const structuredData = extractStructuredData($);
  if (structuredData && Object.keys(structuredData).length > 0) {
    product_name = structuredData.product_name || product_name;
    price = structuredData.price || price;
    manufacturer = structuredData.manufacturer || manufacturer;
    net_quantity = structuredData.net_quantity || net_quantity;
    country_of_origin = structuredData.country_of_origin || country_of_origin;
  }

  // Site-specific extractors for enhanced accuracy
  
  if (isFlipkart) {
    // Enhanced Flipkart-specific selectors (2024 current structure)
    console.log('Processing Flipkart URL with enhanced selectors');
    
    // Product name - try multiple current selectors
    product_name = product_name || (
      $('span[class*="B_NuCI"]').text() ||  // Current main title class
      $('h1[class*="x2Jnos"]').text() ||    // Alternative title class  
      $('span.B_NuCI').text() ||            // Main product title
      $('h1').filter(function() {
        return $(this).text().length > 10;   // Find substantial h1 content
      }).first().text() ||
      $('._35KyD6').text() ||               // Fallback older selector
      $('[data-testid="lblPDPProductName"]').text() ||
      $('h1').first().text()
    ).trim() || null;
    
    // Price - multiple current price selectors
    price = price || (
      $('div[class*="_30jeq3 _16Jk6d"]').text() ||  // Current price format
      $('div[class*="_30jeq3"]').text() ||          // Price container
      $('._3I9_wc._2p6lqe').text() ||               // Discounted price
      $('._1_WHN1').text() ||                       // MRP
      $('div[class*="price"]').first().text() ||    // Generic price
      $('[data-testid="lblPDPPrice"]').text() ||
      $('._25b18c .notranslate').text()             // Another price format
    ).trim() || null;
    
    // Manufacturer/Brand - enhanced extraction
    manufacturer = manufacturer || (
      $('div:contains("Brand") + div').text() ||           // Specification row
      $('td:contains("Brand")').next('td').text() ||       // Table format
      $('._2WkVRV._13WGFt').text() ||                      // Old brand selector
      $('tr:contains("Brand") td:last').text() ||          // Table last cell
      $('._21Ahn-').text() ||                              // Fallback
      $('[data-testid="lblPDPBrand"]').text() ||
      $('div[class*="brand"]').text()                      // Generic brand class
    ).trim() || null;
    
    // Net quantity/weight
    net_quantity = net_quantity || (
      $('div:contains("Net Quantity") + div').text() ||    // Specification format
      $('div:contains("Weight") + div').text() ||
      $('td:contains("Net Quantity")').next('td').text() ||
      $('td:contains("Weight")').next('td').text() ||
      $('._3dG3ix').text() ||                              // Fallback older
      $('[data-testid="lblPDPNetQuantity"]').text() ||
      $('div:contains("Pack Size") + div').text()          // Alternative format
    ).trim() || null;
    
    // Country of origin
    country_of_origin = country_of_origin || (
      $('div:contains("Country of Origin") + div').text() ||
      $('td:contains("Country of Origin")').next('td').text() ||
      $('div:contains("Made in") + div').text() ||
      $('td:contains("Made in")').next('td').text() ||
      $('[data-testid="lblPDPOrigin"]').text() ||
      $('div:contains("Manufactured") + div').text()       // Alternative phrasing
    ).trim() || null;
                        
  } else if (isMyntra) {
    // Enhanced Myntra-specific selectors (updated for current site structure)
    product_name = product_name || ($('.pdp-name').text() ||
                   $('h1.pdp-title').text() ||
                   $('.pdp-product-name').text() ||
                   $('.product-title h1').text() ||
                   $('h1').first().text()).trim() || null;
    
    price = price || ($('.pdp-price strong').text() ||
            $('.price-price span').text() ||
            $('.pdp-mrp').text() ||
            $('.discounted-price').text() ||
            $('[class*="price"]').first().text()).trim() || null;
    
    manufacturer = manufacturer || ($('.pdp-product-brand-name').text() ||
                   $('.index-brand').text() ||
                   $('.brand-name').text() ||
                   $('.pdp-brand a').text() ||
                   $('.supplier-table tr:contains("Brand") td').text()).trim() || null;
    
    net_quantity = net_quantity || ($('.supplier-table tr:contains("Weight") td').text() ||
                   $('.product-details tr:contains("Net Quantity") td').text() ||
                   $('.size-buttons button.selected').text()).trim() || null;
    
    country_of_origin = country_of_origin || ($('.supplier-table tr:contains("Country of Origin") td').text() ||
                        $('.product-details tr:contains("Made in") td').text()).trim() || null;
                        
  } else if (isNykaa) {
    // Nykaa-specific selectors  
    product_name = product_name || ($('.product-title').text() ||
                   $('h1.css-1gc4x7i').text() ||
                   $('.css-xhqlr').text() ||
                   $('h1').first().text()).trim() || null;
    
    price = price || ($('.css-1jczs19').text() ||
            $('.discounted-price').text() ||
            $('[class*="price"]').first().text()).trim() || null;
    
    manufacturer = manufacturer || ($('.brand-name').text() ||
                   $('.css-k008qs').text() ||
                   $('.product-details tr:contains("Brand") td').text()).trim() || null;
                   
  } else if (isAmazon) {
    // Amazon-specific selectors
    product_name = ($('#productTitle').text() ||
                   $('h1[data-automation-id="product-title"]').text() ||
                   $('h1').first().text()).trim() || null;
    
    price = ($('.a-price .a-offscreen').first().text() ||
            $('.a-price-whole').first().text() + '.' + $('.a-price-fraction').first().text() ||
            $('.a-price-range .a-price .a-offscreen').first().text() ||
            $('[class*="price"]').first().text()).trim() || null;
    
    // Extract manufacturer from various Amazon-specific locations
    manufacturer = ($('[data-feature-name="bylineInfo"] a').text() ||
                   $('.author .contributorNameID').text() ||
                   'a[data-asin]:contains("Store")'.text().replace(/Visit the|Store/g, '').trim() ||
                   $('.po-brand .po-break-word').text() ||
                   $('#bylineInfo_feature_div a').text() ||
                   $('tr:contains("Brand") td').text() ||
                   $('th:contains("Brand")').next().text()).trim() || null;
    
    // Extract quantity/weight from product details (Amazon-specific)
    net_quantity = ($('tr:contains("Item Weight") td:last').text() ||
                   $('tr:contains("Package Weight") td:last').text() ||
                   $('tr:contains("Net Quantity") td:last').text() ||
                   $('.po-item_weight .po-break-word').text() ||
                   $('span:contains("g"), span:contains("kg"), span:contains("ml"), span:contains("l")').first().text()).trim() || null;
    
    // Extract country from product details
    country_of_origin = ($('tr:contains("Country of Origin") td').text() ||
                        $('tr:contains("Made in") td').text() ||
                        $('.a-size-base:contains("Country")').parent().text()).trim() || null;
  } else {
    // Enhanced generic fallback with multiple strategies
    product_name = product_name || getGenericProductName($);
    price = price || getGenericPrice($);
    manufacturer = manufacturer || getGenericManufacturer($);
    net_quantity = net_quantity || getGenericQuantity($);
    country_of_origin = country_of_origin || getGenericCountryOfOrigin($);
  }
  
  // Clean up extracted data (ensure they are strings)
  if (product_name && typeof product_name === 'string') product_name = product_name.substring(0, 200);
  if (price && typeof price === 'string') price = price.substring(0, 50);
  if (net_quantity && typeof net_quantity === 'string') net_quantity = net_quantity.substring(0, 50);
  if (manufacturer && typeof manufacturer === 'string') manufacturer = manufacturer.substring(0, 100);
  if (country_of_origin && typeof country_of_origin === 'string') country_of_origin = country_of_origin.substring(0, 100);
  
  let rawData = {
    product_name,
    MRP: price,
    net_quantity,
    manufacturer,
    country_of_origin
  };

  // Apply AI normalization for better data quality
  const normalizedData = await normalizeProductData(rawData);
  
  return normalizedData;
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

      // Rule engine with different requirements for URL vs Image processing
      const isImageSource = parsed._ocr_source === 'image';
      
      // All 6 mandatory Legal Metrology fields for images, basic fields for URLs
      const requiredForImages = [
        'product_name',
        'MRP', 
        'manufacturer',
        'net_quantity',
        'country_of_origin',
        'consumer_care',
        'date_of_manufacture'
      ];
      
      const requiredForUrls = [
        'product_name',
        'MRP', 
        'manufacturer',
        'net_quantity',
        'country_of_origin'
      ];
      
      const required = isImageSource ? requiredForImages : requiredForUrls;
      const violations = [];
      
      const fieldNames = {
        'product_name': 'Product Name',
        'MRP': 'MRP (Retail Sale Price)',
        'manufacturer': 'Manufacturer/Packer/Importer Name & Address',
        'net_quantity': 'Net Quantity',
        'country_of_origin': 'Country of Origin',
        'consumer_care': 'Consumer Care Details',
        'date_of_manufacture': 'Date of Manufacture/Import'
      };
      
      required.forEach(k => { 
        if (!parsed[k] || (typeof parsed[k] === 'string' && parsed[k].trim() === '')) {
          violations.push(`${fieldNames[k]} missing`);
        }
      });

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
      
      const sanitizedError = sanitizeError(err);
      const statusCode = err.message.includes('validation') || err.message.includes('Invalid') ? 400 : 500;
      
      res.status(statusCode).json({ 
        error: sanitizedError,
        timestamp: new Date().toISOString()
      });
    }
  }
);

// Get submission history
app.get('/api/submissions', async (req, res) => {
  try {
    const { limit = 50, offset = 0, user_id = 'demo_user' } = req.query;
    const submissions = await operations.getSubmissions(user_id, parseInt(limit), parseInt(offset));
    // Transform for frontend compatibility
    const formattedSubmissions = submissions.map(sub => ({
      id: sub.id,
      product_preview: sub.product_name || 'Unknown product',
      input_type: sub.input_type,
      parsed: {
        product_name: sub.product_name,
        MRP: sub.raw_data.MRP,
        manufacturer: sub.raw_data.manufacturer,
        net_quantity: sub.raw_data.net_quantity,
        country_of_origin: sub.raw_data.country_of_origin,
        consumer_care: sub.raw_data.consumer_care,
        date_of_manufacture: sub.raw_data.date_of_manufacture,
        _ocr_confidence: sub.raw_data._ocr_confidence,
        _image_resolution: sub.raw_data._image_resolution,
        _field_confidences: sub.field_confidences
      },
      compliance_score: sub.compliance_score,
      status: sub.status,
      violations: [], // Will be populated if needed
      timestamp: sub.timestamp,
      highlight: sub.status === 'failed' || sub.compliance_score < 100
    }));

    res.json({
      submissions: formattedSubmissions,
      total: formattedSubmissions.length,
      has_more: formattedSubmissions.length === parseInt(limit)
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
    // Fetch violations for this submission
    const violations = await operations.getViolationsBySubmissionId(req.params.id);

    // Transform for frontend compatibility
    const formatted = {
      id: submission.id,
      product_preview: submission.product_name || 'Unknown product',
      input_type: submission.input_type,
      parsed: {
        product_name: submission.product_name,
        MRP: submission.raw_data.MRP,
        manufacturer: submission.raw_data.manufacturer,
        net_quantity: submission.raw_data.net_quantity,
        country_of_origin: submission.raw_data.country_of_origin,
        consumer_care: submission.raw_data.consumer_care,
        date_of_manufacture: submission.raw_data.date_of_manufacture,
        _ocr_confidence: submission.raw_data._ocr_confidence,
        _image_resolution: submission.raw_data._image_resolution,
        _field_confidences: submission.field_confidences
      },
      compliance_score: submission.compliance_score,
      status: submission.status,
      violations: violations || [],
      timestamp: submission.created_at,
      highlight: submission.status === 'failed' || submission.compliance_score < 100
    };

    res.json(formatted);
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
    
    // Transform for recharts format - ensure we have data for all days
    const formatted = trendData.map((item, index) => ({
      x: `Day ${index + 1}`,
      compliance: Math.round(item.avg_score || 0),
      date: item.date,
      submissions: item.submissions || 0
    }));
    
    // If no data, return some sample data for the demo
    if (formatted.length === 0) {
      const today = new Date();
      for (let i = 29; i >= 0; i--) {
        const date = new Date(today);
        date.setDate(date.getDate() - i);
        formatted.push({
          x: `Day ${30 - i}`,
          compliance: Math.floor(Math.random() * 30) + 70, // Random between 70-100
          date: date.toISOString().split('T')[0],
          submissions: Math.floor(Math.random() * 5) + 1
        });
      }
    }
    
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
    
    // If no data, return some sample data for the demo
    if (formatted.length === 0) {
      const sampleBrands = ['Brand A', 'Brand B', 'Brand C', 'Brand D', 'Brand E'];
      formatted.push(...sampleBrands.map((brand, index) => ({
        brand,
        violations: Math.floor(Math.random() * 15) + 5,
        submissions: Math.floor(Math.random() * 10) + 3,
        avg_score: Math.floor(Math.random() * 30) + 65
      })));
    }
    
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
app.use('*', (req, res) => {
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
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`Security headers enabled: ${process.env.NODE_ENV === 'production' ? 'Yes' : 'Development mode'}`);
});