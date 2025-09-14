/**
 * CompliScan Database Module
 * SQLite database for persistent storage of submissions, violations, and metrics
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// Ensure database directory exists
const dbDir = path.join(__dirname, 'data');
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const dbPath = path.join(dbDir, 'compliscan.db');
const db = new Database(dbPath);

// Enable WAL mode for better performance and concurrency
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');
db.pragma('cache_size = 1000');
db.pragma('foreign_keys = ON');

// Database Schema
const schema = `
-- Submissions table - main compliance check records
CREATE TABLE IF NOT EXISTS submissions (
  id TEXT PRIMARY KEY,
  user_id TEXT DEFAULT 'demo_user',
  product_name TEXT,
  input_type TEXT NOT NULL CHECK (input_type IN ('image', 'url')),
  input_source TEXT, -- URL or original filename
  
  -- Legal Metrology Fields (6 mandatory)
  manufacturer TEXT,
  net_quantity TEXT,
  mrp TEXT,
  consumer_care TEXT,
  date_of_manufacture TEXT,
  country_of_origin TEXT,
  
  -- Compliance Results
  compliance_score INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL CHECK (status IN ('approved', 'failed', 'needs_review')),
  
  -- Technical Metadata
  ocr_confidence REAL,
  image_width INTEGER,
  image_height INTEGER,
  processing_time_ms INTEGER,
  
  -- Audit Fields
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  
  -- Raw Data (JSON)
  raw_data TEXT, -- Full parsed data as JSON
  field_confidences TEXT, -- Field-level confidence scores as JSON
  extracted_text TEXT -- OCR extracted text sample
);

-- Violations table - detailed compliance issues
CREATE TABLE IF NOT EXISTS violations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  submission_id TEXT NOT NULL,
  field_name TEXT NOT NULL,
  violation_type TEXT NOT NULL CHECK (violation_type IN ('missing', 'format', 'invalid')),
  severity TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'high')),
  message TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (submission_id) REFERENCES submissions(id) ON DELETE CASCADE
);

-- Analytics views for metrics
CREATE TABLE IF NOT EXISTS analytics_cache (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  metric_name TEXT NOT NULL UNIQUE,
  metric_value TEXT NOT NULL, -- JSON data
  calculated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_submissions_created_at ON submissions(created_at);
CREATE INDEX IF NOT EXISTS idx_submissions_status ON submissions(status);
CREATE INDEX IF NOT EXISTS idx_submissions_user_id ON submissions(user_id);
CREATE INDEX IF NOT EXISTS idx_violations_submission_id ON violations(submission_id);
CREATE INDEX IF NOT EXISTS idx_violations_field_name ON violations(field_name);
CREATE INDEX IF NOT EXISTS idx_violations_severity ON violations(severity);
`;

// Initialize database schema
function initializeDatabase() {
  console.log('Initializing CompliScan database...');
  
  try {
    // Execute schema creation
    db.exec(schema);
    
    // Update database version
    db.prepare(`
      CREATE TABLE IF NOT EXISTS db_version (
        version INTEGER PRIMARY KEY,
        applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `).run();
    
    const currentVersion = db.prepare('SELECT MAX(version) as version FROM db_version').get();
    if (!currentVersion.version) {
      db.prepare('INSERT INTO db_version (version) VALUES (1)').run();
      console.log('Database initialized with schema version 1');
    }
    
    console.log('Database initialization completed successfully');
    return true;
  } catch (error) {
    console.error('Database initialization failed:', error);
    throw error;
  }
}

// Database Operations
const operations = {
  
  // Store a new submission
  insertSubmission(submissionData) {
    const stmt = db.prepare(`
      INSERT INTO submissions (
        id, user_id, product_name, input_type, input_source,
        manufacturer, net_quantity, mrp, consumer_care, date_of_manufacture, country_of_origin,
        compliance_score, status, ocr_confidence, image_width, image_height, processing_time_ms,
        raw_data, field_confidences, extracted_text
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    return stmt.run(
      submissionData.id,
      submissionData.user_id || 'demo_user',
      submissionData.product_name,
      submissionData.input_type,
      submissionData.input_source,
      submissionData.manufacturer,
      submissionData.net_quantity,
      submissionData.mrp,
      submissionData.consumer_care,
      submissionData.date_of_manufacture,
      submissionData.country_of_origin,
      submissionData.compliance_score,
      submissionData.status,
      submissionData.ocr_confidence,
      submissionData.image_width,
      submissionData.image_height,
      submissionData.processing_time_ms,
      JSON.stringify(submissionData.raw_data),
      JSON.stringify(submissionData.field_confidences),
      submissionData.extracted_text
    );
  },
  
  // Store violations for a submission
  insertViolations(submissionId, violations) {
    if (!violations || violations.length === 0) return;
    
    const stmt = db.prepare(`
      INSERT INTO violations (submission_id, field_name, violation_type, severity, message)
      VALUES (?, ?, ?, ?, ?)
    `);
    
    const transaction = db.transaction((violations) => {
      for (const violation of violations) {
        stmt.run(
          submissionId,
          violation.field,
          violation.type,
          violation.severity,
          violation.message
        );
      }
    });
    
    return transaction(violations);
  },
  
  // Get submission history
  getSubmissions(userId = 'demo_user', limit = 50, offset = 0) {
    const stmt = db.prepare(`
      SELECT 
        id, product_name, input_type, input_source,
        compliance_score, status, created_at,
        raw_data, field_confidences
      FROM submissions 
      WHERE user_id = ?
      ORDER BY created_at DESC 
      LIMIT ? OFFSET ?
    `);
    
    const rows = stmt.all(userId, limit, offset);
    
    // Parse JSON fields
    return rows.map(row => ({
      ...row,
      raw_data: JSON.parse(row.raw_data || '{}'),
      field_confidences: JSON.parse(row.field_confidences || '{}'),
      timestamp: row.created_at
    }));
  },
  
  // Get single submission with violations
  getSubmissionById(submissionId) {
    const submissionStmt = db.prepare(`
      SELECT * FROM submissions WHERE id = ?
    `);
    
    const violationsStmt = db.prepare(`
      SELECT field_name, violation_type, severity, message, created_at
      FROM violations 
      WHERE submission_id = ?
      ORDER BY severity DESC, field_name ASC
    `);
    
    const submission = submissionStmt.get(submissionId);
    if (!submission) return null;
    
    const violations = violationsStmt.all(submissionId);
    
    return {
      ...submission,
      raw_data: JSON.parse(submission.raw_data || '{}'),
      field_confidences: JSON.parse(submission.field_confidences || '{}'),
      violations: violations.map(v => ({
        field: v.field_name,
        type: v.violation_type,
        severity: v.severity,
        message: v.message
      }))
    };
  },
  
  // Analytics operations
  getComplianceTrend(userId = 'demo_user', days = 30) {
    const stmt = db.prepare(`
      SELECT 
        DATE(created_at) as date,
        AVG(compliance_score) as avg_score,
        COUNT(*) as submissions
      FROM submissions 
      WHERE user_id = ? AND created_at >= datetime('now', '-' || ? || ' days')
      GROUP BY DATE(created_at)
      ORDER BY date ASC
    `);
    
    return stmt.all(userId, days);
  },
  
  getViolationsByBrand(userId = 'demo_user', limit = 10) {
    const stmt = db.prepare(`
      SELECT 
        manufacturer as brand,
        COUNT(DISTINCT s.id) as total_submissions,
        COUNT(v.id) as total_violations,
        AVG(s.compliance_score) as avg_score
      FROM submissions s
      LEFT JOIN violations v ON s.id = v.submission_id
      WHERE s.user_id = ? AND s.manufacturer IS NOT NULL
      GROUP BY s.manufacturer
      HAVING COUNT(DISTINCT s.id) > 0
      ORDER BY total_violations DESC, total_submissions DESC
      LIMIT ?
    `);
    
    return stmt.all(userId, limit);
  },
  
  getOverallStats(userId = 'demo_user') {
    const stmt = db.prepare(`
      SELECT 
        COUNT(*) as total_submissions,
        AVG(compliance_score) as avg_compliance_score,
        COUNT(CASE WHEN status = 'approved' THEN 1 END) as approved_count,
        COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_count,
        COUNT(CASE WHEN status = 'needs_review' THEN 1 END) as needs_review_count,
        MAX(created_at) as last_submission,
        COUNT(CASE WHEN input_type = 'image' THEN 1 END) as image_submissions,
        COUNT(CASE WHEN input_type = 'url' THEN 1 END) as url_submissions
      FROM submissions 
      WHERE user_id = ?
    `);
    
    return stmt.get(userId);
  },
  
  // Database maintenance
  cleanup() {
    db.prepare('DELETE FROM submissions WHERE created_at < datetime("now", "-90 days")').run();
    db.prepare('VACUUM').run();
  },
  
  // Close database connection
  close() {
    db.close();
  }
};

// Initialize database on module load
initializeDatabase();

module.exports = {
  db,
  operations,
  initializeDatabase
};