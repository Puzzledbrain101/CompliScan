// ocr-processor.js - Real OCR processing for Legal Metrology compliance
const sharp = require('sharp');
const Tesseract = require('tesseract.js');
const fs = require('fs').promises;

// Confidence for a value found next to its label vs. one inferred without a label
const LABELED = 0.85;
const UNLABELED = 0.6;

// A line starting with one of these begins a new declaration, so multi-line
// values (manufacturer address) stop there
const LABEL_START = /^(?:m\.?\s*r\.?\s*p|price|net\s*(?:qty|quantity|wt|weight|contents?|vol)|mfg|mfd|manufactured|manufacturing|packed|pkd|packing|marketed|imported|country|made\s*in|product\s*of|origin|customer|consumer|helpline|toll\s*free|e-?mail|best\s*before|exp|use\s*by|batch|lot|b\.?\s*no|ingredients|date)/i;

const UNIT = '(?:kg|g|gm|gms|mg|ml|l|ltr|litres?|liters?|pcs|pieces?|nos?|tablets?|capsules?)';
const MONTH = '(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\\.?';
const DATE_VALUE = `(\\d{1,2}[\\/\\-.]\\d{1,2}[\\/\\-.]\\d{2,4}|\\d{1,2}[\\/\\-.]\\d{2,4}|${MONTH}[\\s\\-\\/']*\\d{2,4})`;

function splitLines(text) {
  return text.split(/\r?\n/).map(l => l.replace(/\s+/g, ' ').trim()).filter(Boolean);
}

function extractProductName(lines) {
  for (const line of lines) {
    const m = line.match(/^(?:product(?:\s*name)?|name)\s*[:\-]\s*(.{3,})$/i);
    if (m) return { value: m[1].trim(), confidence: LABELED };
  }
  for (const line of lines) {
    const m = line.match(/^([A-Za-z][A-Za-z\s&'-]*\b(?:cream|lotion|powder|tablets?|capsules?|soap|oil|shampoo|gel|wash|serum|biscuits?|namkeen|bhujia|chips|tea|coffee|atta|rice|dal|masala|ghee|juice|drink|sauce|pickle|noodles))\b/i);
    if (m) return { value: m[1].trim(), confidence: UNLABELED };
  }
  return null;
}

function extractMrp(text) {
  const labeled = text.match(/\b(?:m\.?\s*r\.?\s*p\.?|maximum\s*retail\s*price)[^0-9₹\n]{0,25}(?:₹|rs\.?|inr)?\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)/i);
  if (labeled) return { value: `₹${labeled[1].replace(/,/g, '')}`, confidence: LABELED };
  const currency = text.match(/(?:₹|\brs\.?|\binr)\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)/i);
  if (currency) return { value: `₹${currency[1].replace(/,/g, '')}`, confidence: UNLABELED };
  return null;
}

function extractNetQuantity(text) {
  const labeled = text.match(new RegExp(`\\bnet\\s*(?:qty|quantity|wt|weight|contents?|vol(?:ume)?)\\.?\\s*[:\\-]?\\s*([0-9]+(?:\\.[0-9]+)?\\s*${UNIT})\\b`, 'i'));
  if (labeled) return { value: labeled[1].trim(), confidence: LABELED };
  const unlabeled = text.match(new RegExp(`\\b([0-9]+(?:\\.[0-9]+)?\\s*${UNIT})\\b`, 'i'));
  if (unlabeled) return { value: unlabeled[1].trim(), confidence: UNLABELED };
  return null;
}

// Name and address of manufacturer / packer / marketer / importer, in that order
function extractManufacturer(lines, continuationLines = 2) {
  const labels = [
    /\b(?:manufactured\s*(?:&|and)?\s*(?:marketed\s*)?by|mfd\.?\s*by|mfg\.?\s*by|made\s*by|manufacturer)\s*[:\-]?\s*(.*)$/i,
    /\b(?:packed\s*by|pkd\.?\s*by|packer|packaged\s*by)\s*[:\-]?\s*(.*)$/i,
    /\b(?:marketed\s*by|marketer)\s*[:\-]?\s*(.*)$/i,
    /\b(?:imported\s*by|importer)\s*[:\-]?\s*(.*)$/i
  ];
  for (const label of labels) {
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(label);
      if (!m) continue;
      const parts = m[1].trim() ? [m[1].trim()] : [];
      // Address often continues on the next lines until another declaration starts
      for (let j = i + 1; j < lines.length && j <= i + continuationLines && !LABEL_START.test(lines[j]); j++) {
        parts.push(lines[j]);
      }
      if (parts.length) {
        return { value: parts.map(p => p.replace(/[,\s]+$/, '')).join(', '), confidence: LABELED };
      }
    }
  }
  return null;
}

// Month/year of manufacture, packing or import (expiry / best-before is NOT this)
function extractDateOfManufacture(text) {
  const m = text.match(new RegExp(
    `\\b(?:mfg|mfd|manufactured|manufacturing|pkd|packed|packing|date\\s*of\\s*(?:mfg|manufacture|packing|packaging|import)|month\\s*(?:and|&)\\s*year\\s*of\\s*(?:mfg|manufacture|packing|import))\\.?\\s*(?:date|on)?\\s*[:\\-.]?\\s*${DATE_VALUE}`,
    'i'
  ));
  if (m) return { value: m[1].trim(), confidence: LABELED };
  return null;
}

function extractCountryOfOrigin(text) {
  const m = text.match(/\b(?:country\s*of\s*origin|made\s*in|product\s*of|origin)\s*[:\-]?[ \t]*([A-Za-z][A-Za-z \t]{1,40})/i);
  if (m) return { value: m[1].trim(), confidence: LABELED };
  return null;
}

function extractConsumerCare(lines, text) {
  const phone = /(\+?\d[\d\s\-()]{8,}\d)/;
  const email = /([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/;
  const label = /\b(?:customer\s*care|consumer\s*care|helpline|toll\s*free|customer\s*support|contact)\b\s*(?:no\.?|number|details|address)?\s*[:\-]?\s*(.*)$/i;
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(label);
    if (!m) continue;
    const nearby = [m[1], lines[i + 1] || ''].join(' ');
    const ph = nearby.match(phone);
    if (ph && ph[1].replace(/\D/g, '').length >= 10) return { value: ph[1].trim(), confidence: LABELED };
    const em = nearby.match(email);
    if (em) return { value: em[1], confidence: LABELED };
    if (m[1].trim().length > 5) return { value: m[1].trim(), confidence: UNLABELED };
  }
  const em = text.match(email);
  if (em) return { value: em[1], confidence: UNLABELED };
  return null;
}

// Extract all Legal Metrology fields from OCR text (or page text).
// Options for web pages: labeledOnly drops values found without a label,
// continuationLines limits how many following lines an address may take.
function extractFieldsFromText(rawText, { labeledOnly = false, continuationLines = 2 } = {}) {
  const text = rawText || '';
  const lines = splitLines(text);
  const found = {
    product_name: extractProductName(lines),
    MRP: extractMrp(text),
    manufacturer: extractManufacturer(lines, continuationLines),
    net_quantity: extractNetQuantity(text),
    country_of_origin: extractCountryOfOrigin(text),
    consumer_care: extractConsumerCare(lines, text),
    date_of_manufacture: extractDateOfManufacture(text)
  };
  const fields = {};
  const confidences = {};
  for (const [key, candidate] of Object.entries(found)) {
    const result = labeledOnly && candidate?.confidence !== LABELED ? null : candidate;
    fields[key] = result ? result.value : null;
    confidences[key] = result ? result.confidence : 0;
  }
  return { fields, confidences };
}

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
    const { fields, confidences: fieldConfidences } = extractFieldsFromText(ocrResult.text);

    // Calculate overall confidence
    const confidenceValues = Object.values(fieldConfidences).filter(c => c > 0);
    const overallConfidence = confidenceValues.length > 0
      ? confidenceValues.reduce((a, b) => a + b, 0) / confidenceValues.length
      : 0;

    const normalizedFields = {
      ...fields,
      _ocr_confidence: Math.max(overallConfidence, ocrResult.confidence),
      _image_resolution: imageResolution,
      _field_confidences: fieldConfidences,
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
  extractFieldsFromText
};