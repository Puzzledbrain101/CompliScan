// schema.js - Normalized ParsedLabel schema for Legal Metrology compliance
// Ensures consistent data structure across OCR, URL scraping, and AI processing

/**
 * Normalized ParsedLabel Schema - All 6 mandatory Legal Metrology fields
 * Based on Legal Metrology (Packaged Commodities) Rules, 2011
 */

const MANDATORY_FIELDS = {
  // 1. Name and address of manufacturer/packer/importer
  manufacturer: {
    required: true,
    type: 'string',
    maxLength: 200,
    description: 'Name and address of manufacturer, packer, or importer',
    validation: /^.{3,}$/  // Minimum 3 characters
  },
  
  // 2. Net quantity in terms of standard units
  net_quantity: {
    required: true,
    type: 'string',
    maxLength: 50,
    description: 'Net quantity in standard units (weight, measure, or number)',
    validation: /\d+\s*(g|kg|ml|l|gm|gms|liters?|pieces?|pcs|tablets?|nos?)/i
  },
  
  // 3. Retail sale price (MRP) inclusive of all taxes
  MRP: {
    required: true,
    type: 'string',
    maxLength: 50,
    description: 'Maximum Retail Price inclusive of all taxes',
    validation: /₹?\s*\d+(?:[.,]\d+)?|rs\.?\s*\d+/i
  },
  
  // 4. Consumer care details
  consumer_care: {
    required: true,
    type: 'string',
    maxLength: 150,
    description: 'Consumer care details (phone, email, or address)',
    validation: /\d{10}|@|\d{3,}/  // Phone, email, or substantial text
  },
  
  // 5. Date of manufacture/import
  date_of_manufacture: {
    required: true,
    type: 'string',
    maxLength: 50,
    description: 'Date of manufacture, packing, or import',
    validation: /\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}|[a-z]{3,}\s*\d{2,4}/i
  },
  
  // 6. Country of origin
  country_of_origin: {
    required: true,
    type: 'string',
    maxLength: 100,
    description: 'Country of origin or manufacture',
    validation: /^[a-z\s]{2,}$/i  // At least 2 characters, letters and spaces only
  }
};

// Optional supplemental fields (not counted in compliance scoring)
const SUPPLEMENTAL_FIELDS = {
  product_name: {
    required: false,
    type: 'string',
    maxLength: 200,
    description: 'Product name or title (supplemental identifier)',
    validation: /^.{3,}$/  // Minimum 3 characters
  }
};

/**
 * Create normalized ParsedLabel with validation and confidence scores
 * @param {Object} rawData - Raw extracted data from OCR or scraping
 * @param {Object} options - Additional options (source, confidence, etc.)
 * @returns {Object} Normalized ParsedLabel
 */
function createNormalizedLabel(rawData, options = {}) {
  const normalized = {};
  const fieldConfidences = {};
  const violations = [];
  
  // Process each mandatory field (exactly 6 for Legal Metrology compliance)
  for (const [fieldName, schema] of Object.entries(MANDATORY_FIELDS)) {
    let value = rawData[fieldName];
    let confidence = options.fieldConfidences?.[fieldName] || 0.5; // Default confidence for URL sources
    
    // Sanitize and validate
    if (value && typeof value === 'string') {
      value = value.trim().substring(0, schema.maxLength);
      
      // Check if value is meaningful (not just placeholder)
      if (value.length < 2 || value.toLowerCase().includes('not available') || 
          value.toLowerCase().includes('n/a') || value === '-' || value === '—') {
        value = null;
      } else {
        // Validate against schema pattern
        if (schema.validation && !schema.validation.test(value)) {
          confidence = Math.max(0, confidence - 0.3); // Reduce confidence for invalid format
          violations.push({
            field: fieldName,
            type: 'format',
            severity: 'medium',
            message: `${schema.description} format is invalid: "${value}"`
          });
        }
      }
    } else {
      value = null;
    }
    
    normalized[fieldName] = value;
    fieldConfidences[fieldName] = confidence;
    
    // Check for missing required fields
    if (schema.required && (!value || value.trim() === '')) {
      violations.push({
        field: fieldName,
        type: 'missing',
        severity: 'high',
        message: `${schema.description} is required but missing`
      });
    }
  }
  
  // Process supplemental fields (don't count in compliance)
  for (const [fieldName, schema] of Object.entries(SUPPLEMENTAL_FIELDS)) {
    let value = rawData[fieldName];
    if (value && typeof value === 'string') {
      value = value.trim().substring(0, schema.maxLength);
      if (value.length < 2 || value.toLowerCase().includes('not available') || 
          value.toLowerCase().includes('n/a') || value === '-' || value === '—') {
        value = null;
      }
    } else {
      value = null;
    }
    normalized[fieldName] = value;
  }
  
  // Calculate overall compliance score (only mandatory fields)
  const totalFields = Object.keys(MANDATORY_FIELDS).length; // Always 6
  const presentFields = Object.entries(MANDATORY_FIELDS)
    .filter(([fieldName]) => normalized[fieldName] && normalized[fieldName].trim()).length;
  
  // Calculate average confidence (only for present fields to avoid over-penalization)
  const presentConfidences = Object.entries(MANDATORY_FIELDS)
    .filter(([fieldName]) => normalized[fieldName])
    .map(([fieldName]) => fieldConfidences[fieldName]);
  const avgConfidence = presentConfidences.length > 0 
    ? presentConfidences.reduce((a, b) => a + b, 0) / presentConfidences.length 
    : 0;
  
  const baseScore = (presentFields / totalFields) * 100;
  const confidencePenalty = avgConfidence < 0.6 ? (0.6 - avgConfidence) * 30 : 0; // Scale penalty
  const complianceScore = Math.max(0, Math.round(baseScore - confidencePenalty));
  
  // Determine status (only based on mandatory fields)
  let status = 'failed';
  const highSeverityViolations = violations.filter(v => v.severity === 'high').length;
  if (highSeverityViolations === 0) {
    status = avgConfidence > 0.7 ? 'approved' : 'needs_review';
  } else if (presentFields >= totalFields * 0.7) {
    status = 'needs_review';
  }
  
  return {
    // Core product data
    ...normalized,
    
    // Metadata
    _schema_version: '1.0',
    _source: options.source || 'unknown',
    _timestamp: new Date().toISOString(),
    
    // Quality metrics
    _ocr_confidence: options.ocrConfidence || 0,
    _image_resolution: options.imageResolution,
    _field_confidences: fieldConfidences,
    
    // Compliance assessment
    compliance_score: complianceScore,
    status: status,
    violations: violations,
    fields_present: presentFields,
    fields_total: totalFields,
    
    // Debug info (only in development)
    ...(process.env.NODE_ENV !== 'production' && {
      _extracted_text: options.extractedText?.substring(0, 500),
      _debug_info: options.debugInfo
    })
  };
}

/**
 * Validate ParsedLabel against schema
 * @param {Object} label - ParsedLabel to validate
 * @returns {Object} Validation result with errors
 */
function validateLabel(label) {
  const errors = [];
  
  // Check required schema fields
  if (!label._schema_version) {
    errors.push('Missing schema version');
  }
  
  if (!label._source) {
    errors.push('Missing source information');
  }
  
  // Check mandatory fields presence
  for (const fieldName of Object.keys(MANDATORY_FIELDS)) {
    if (!(fieldName in label)) {
      errors.push(`Missing field: ${fieldName}`);
    }
  }
  
  return {
    valid: errors.length === 0,
    errors: errors
  };
}

/**
 * Get field schema information
 * @param {string} fieldName - Name of the field
 * @returns {Object} Schema information for the field
 */
function getFieldSchema(fieldName) {
  return MANDATORY_FIELDS[fieldName] || null;
}

/**
 * Get all mandatory field names
 * @returns {Array} Array of mandatory field names
 */
function getMandatoryFields() {
  return Object.keys(MANDATORY_FIELDS);
}

module.exports = {
  MANDATORY_FIELDS,
  SUPPLEMENTAL_FIELDS,
  createNormalizedLabel,
  validateLabel,
  getFieldSchema,
  getMandatoryFields
};