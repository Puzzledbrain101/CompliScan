// ocr-processor.js - Real OCR processing for Legal Metrology compliance
const sharp = require('sharp');
const Tesseract = require('tesseract.js');
const fs = require('fs').promises;

// Legal Metrology field extractors with regex patterns
const FIELD_PATTERNS = {
  // Product name - typically first prominent text or labeled
  product_name: [
    /name[:\s]+([^\n\r]+)/gi,
    /product[:\s]+([^\n\r]+)/gi,
    /^([A-Za-z\s&]+(?:cream|lotion|powder|tablet|capsule|soap|oil|shampoo|face|skin|hair|body))/gmi
  ],
  
  // MRP (Maximum Retail Price) - must include price with ₹ or Rs.
  mrp_inclusive: [
    /(?:mrp|m\.r\.p\.?|price|cost)[:\s]*₹?[\s]*([0-9]+(?:[.,][0-9]+)?)/gi,
    /₹[\s]*([0-9]+(?:[.,][0-9]+)?)/g,
    /rs\.?[\s]*([0-9]+(?:[.,][0-9]+)?)/gi,
    /inr[\s]*([0-9]+(?:[.,][0-9]+)?)/gi
  ],
  
  // Net quantity - weight, volume, or count
  net_quantity: [
    /(?:net[\s]*qty|net[\s]*wt|quantity|weight|contents?)[:\s]*([0-9]+(?:\.[0-9]+)?[\s]*(?:g|kg|ml|l|gm|gms|liters?|pieces?|pcs|tablets?|nos?))/gi,
    /([0-9]+(?:\.[0-9]+)?[\s]*(?:g|kg|ml|l|gm|gms|liters?|pieces?|pcs|tablets?|nos?))/gi
  ],
  
  // Manufacturer, packer, or importer details
  manufacturer_or_importer_name_address: [
    /(?:mfg\.?|manufactured[\s]*by|mfd\.?[\s]*by|made[\s]*by|manufacturer)[:\s]*([^\n\r]+(?:\n[^\n\r]+){0,2})/gi,
    /(?:packed[\s]*by|packer|packaged[\s]*by)[:\s]*([^\n\r]+(?:\n[^\n\r]+){0,2})/gi,
    /(?:imported[\s]*by|importer)[:\s]*([^\n\r]+(?:\n[^\n\r]+){0,2})/gi,
    /(?:marketed[\s]*by|marketer)[:\s]*([^\n\r]+(?:\n[^\n\r]+){0,2})/gi
  ],
  
  // Date of manufacture, packaging, or import
  month_year_of_manufacture_pack_or_import: [
    /(?:mfg\.?[\s]*date|manufactured[\s]*on|mfd\.?[\s]*on|date[\s]*of[\s]*mfg)[:\s]*([0-9]{1,2}[\/\-\.][0-9]{1,2}[\/\-\.][0-9]{2,4}|[a-z]{3,}[\s]*[0-9]{2,4})/gi,
    /(?:packed[\s]*on|pkg\.?[\s]*date|packing[\s]*date)[:\s]*([0-9]{1,2}[\/\-\.][0-9]{1,2}[\/\-\.][0-9]{2,4}|[a-z]{3,}[\s]*[0-9]{2,4})/gi,
    /(?:exp\.?[\s]*date|expiry|expires?[\s]*on|best[\s]*before)[:\s]*([0-9]{1,2}[\/\-\.][0-9]{1,2}[\/\-\.][0-9]{2,4}|[a-z]{3,}[\s]*[0-9]{2,4})/gi
  ],
  
  // Country of origin
  country_of_origin: [
    /(?:country[\s]*of[\s]*origin|origin|made[\s]*in)[:\s]*([a-z\s]+)/gi,
    /made[\s]*in[\s]*([a-z\s]+)/gi
  ],
  
  // Consumer care details (phone, email, address)
  consumer_care: [
    /(?:customer[\s]*care|consumer[\s]*care|helpline|support)[:\s]*([0-9\s\-\+\(\)]+)/gi,
    /(?:ph\.?|phone|tel\.?|call)[:\s]*([0-9\s\-\+\(\)]+)/gi,
    /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g,
    /(?:address|contact)[:\s]*([^\n\r]+(?:\n[^\n\r]+){0,2})/gi
  ]
};

// Preprocess image for better OCR accuracy
async function preprocessImage(imagePath) {
  try {
    const outputPath = imagePath.replace(/\.[^/.]+$/, '_processed.png');
    
    await sharp(imagePath)
      .greyscale()
      .resize({ width: 1200, height: null, withoutEnlargement: true })
      .sharpen()
      .threshold(180)
      .png()
      .toFile(outputPath);
    
    return outputPath;
  } catch (error) {
    console.error('Image preprocessing failed:', error.message);
    return imagePath; // Return original if preprocessing fails
  }
}

// Extract text using Tesseract.js with language fallback
async function extractTextFromImage(imagePath) {
  try {
    const processedPath = await preprocessImage(imagePath);
    
    let ocrResult;
    try {
      // Try with Hindi support first
      ocrResult = await Tesseract.recognize(processedPath, 'eng+hin', {
        logger: m => {
          if (m.status === 'recognizing text') {
            console.log(`OCR Progress: ${Math.round(m.progress * 100)}%`);
          }
        }
      });
    } catch (hindiError) {
      console.log('Hindi language pack failed, falling back to English only:', hindiError.message);
      // Fallback to English only
      ocrResult = await Tesseract.recognize(processedPath, 'eng', {
        logger: m => {
          if (m.status === 'recognizing text') {
            console.log(`OCR Progress (English): ${Math.round(m.progress * 100)}%`);
          }
        }
      });
    }
    
    // Clean up processed image
    if (processedPath !== imagePath) {
      try {
        await fs.unlink(processedPath);
      } catch (e) {
        // Ignore cleanup errors
      }
    }
    
    return {
      text: ocrResult.data.text,
      confidence: ocrResult.data.confidence / 100, // Convert to 0-1 scale
      blocks: ocrResult.data.blocks
    };
  } catch (error) {
    console.error('OCR extraction failed:', error.message);
    throw new Error(`OCR processing failed: ${error.message}`);
  }
}

// Extract specific field using patterns
function extractField(text, fieldName) {
  const patterns = FIELD_PATTERNS[fieldName] || [];
  let bestMatch = null;
  let highestConfidence = 0;
  
  for (const pattern of patterns) {
    const matches = text.match(pattern);
    if (matches) {
      for (const match of matches) {
        const groups = pattern.exec(text);
        if (groups && groups[1]) {
          const value = groups[1].trim();
          if (value.length > 2) {
            // Simple confidence based on length and position
            const confidence = Math.min(0.9, 0.6 + (value.length / 100));
            if (confidence > highestConfidence) {
              highestConfidence = confidence;
              bestMatch = value;
            }
          }
        }
        // Reset regex lastIndex for global patterns
        pattern.lastIndex = 0;
      }
    }
  }
  
  return {
    value: bestMatch,
    confidence: highestConfidence
  };
}

// Main OCR processing function
async function processLabelImage(imagePath) {
  try {
    console.log('Starting OCR processing for:', imagePath);
    
    // Get image metadata
    const metadata = await sharp(imagePath).metadata();
    const imageResolution = {
      width: metadata.width,
      height: metadata.height
    };
    
    // Extract text using OCR
    const ocrResult = await extractTextFromImage(imagePath);
    console.log('OCR extraction completed with confidence:', ocrResult.confidence);
    
    // Extract all required Legal Metrology fields
    const fields = {};
    const fieldConfidences = {};
    
    for (const fieldName of Object.keys(FIELD_PATTERNS)) {
      const extraction = extractField(ocrResult.text, fieldName);
      fields[fieldName] = extraction.value;
      fieldConfidences[fieldName] = extraction.confidence;
    }
    
    // Calculate overall confidence
    const confidenceValues = Object.values(fieldConfidences).filter(c => c > 0);
    const overallConfidence = confidenceValues.length > 0 
      ? confidenceValues.reduce((a, b) => a + b, 0) / confidenceValues.length 
      : 0;
    
    // Map to canonical keys expected by server
    const normalizedFields = {
      product_name: fields.product_name || null,
      MRP: fields.mrp_inclusive || null,
      manufacturer: fields.manufacturer_or_importer_name_address || null,
      net_quantity: fields.net_quantity || null,
      country_of_origin: fields.country_of_origin || null,
      consumer_care: fields.consumer_care || null,
      date_of_manufacture: fields.month_year_of_manufacture_pack_or_import || null,
      _ocr_confidence: Math.max(overallConfidence, ocrResult.confidence),
      _image_resolution: imageResolution,
      _field_confidences: {
        product_name: fieldConfidences.product_name || 0,
        MRP: fieldConfidences.mrp_inclusive || 0,
        manufacturer: fieldConfidences.manufacturer_or_importer_name_address || 0,
        net_quantity: fieldConfidences.net_quantity || 0,
        country_of_origin: fieldConfidences.country_of_origin || 0,
        consumer_care: fieldConfidences.consumer_care || 0,
        date_of_manufacture: fieldConfidences.month_year_of_manufacture_pack_or_import || 0
      },
      _extracted_text: ocrResult.text.substring(0, 500), // Keep sample for debugging
      _ocr_source: 'image'
    };
    
    console.log('OCR processing completed. Fields extracted:', Object.keys(normalizedFields).filter(k => normalizedFields[k] && !k.startsWith('_')));
    
    return normalizedFields;
    
  } catch (error) {
    console.error('OCR processing error:', error.message);
    throw new Error(`Failed to process label image: ${error.message}`);
  }
}

module.exports = {
  processLabelImage,
  extractTextFromImage,
  FIELD_PATTERNS
};