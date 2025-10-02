// File: src/App.jsx
// ComplianceApp component with real analytics integration
import React, { useState, useRef, useEffect } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  Legend
} from 'recharts';

export default function ComplianceApp() {
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const [selectedSubmission, setSelectedSubmission] = useState(null);
  const [logs, setLogs] = useState(() => {
    try {
      const savedLogs = localStorage.getItem('compliscan_submissions');
      return savedLogs ? JSON.parse(savedLogs) : [];
    } catch (error) {
      return [];
    }
  });
  const [trendData, setTrendData] = useState([]);
  const [brandViolations, setBrandViolations] = useState([]);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [analyticsError, setAnalyticsError] = useState(null);
  const [overallStats, setOverallStats] = useState(null);
  const fileInputRef = useRef();
  const linkInputRef = useRef();

  // API Base URL - Updated for production
  const API_BASE_URL = 'https://compliscan-backend.onrender.com';

  // Save submissions to localStorage whenever logs change
  useEffect(() => {
    try {
      localStorage.setItem('compliscan_submissions', JSON.stringify(logs));
    } catch (error) {
      // ignore
    }
  }, [logs]);

  // Mock rule engine run on parsed fields
 function runRuleEngine(parsed) {
  // Check for both possible field name formats (backend might use different casing)
  const productName = parsed.product_name || parsed.productName;
  const mrp = parsed.MRP || parsed.mrp || parsed.price;
  const manufacturer = parsed.manufacturer || parsed.brand;
  const netQuantity = parsed.net_quantity || parsed.netQuantity || parsed.quantity;
  const countryOfOrigin = parsed.country_of_origin || parsed.countryOfOrigin || parsed.origin;
  
  const required = [
    { key: 'product_name', value: productName, name: 'Product Name' },
    { key: 'MRP', value: mrp, name: 'MRP (Retail Sale Price)' },
    { key: 'manufacturer', value: manufacturer, name: 'Manufacturer/Packer/Importer Name & Address' },
    { key: 'net_quantity', value: netQuantity, name: 'Net Quantity' },
    { key: 'country_of_origin', value: countryOfOrigin, name: 'Country of Origin' }
  ];
  
  const violations = [];
  required.forEach((field) => {
    if (!field.value || (typeof field.value === 'string' && field.value.trim() === '')) {
      violations.push(`${field.name} missing`);
    }
  });

  // Simple OCR quality checks
  const reasons = [];
  const ocrConfidence = parsed._ocr_confidence || parsed.ocr_confidence || parsed.confidence;
  const imageResolution = parsed._image_resolution || parsed.image_resolution;
  
  if (ocrConfidence && ocrConfidence < 0.6) reasons.push('Low OCR confidence (text unclear)');
  if (imageResolution && (imageResolution.width < 400 || imageResolution.height < 300)) reasons.push('Low resolution image');

  const score = Math.max(0, Math.round((1 - violations.length / required.length - (reasons.length * 0.05)) * 100));

  const status = violations.length === 0 && reasons.length === 0 ? 'approved' : 
                (reasons.length > 0 && violations.length === 0 ? 'rejected' : 'failed');

  return {
    compliance_score: score,
    violations,
    reasons,
    status,
  };
}
  // Function to call the backend API
  async function callBackendAPI({ type, file, url }) {
    const backendUrl = `${API_BASE_URL}/api/check`;
    const formData = new FormData();
    if (type === 'url') {
      if (!url || !url.startsWith('http')) throw new Error('Invalid URL');
      formData.append('url', url);
    } else if (type === 'image') {
      if (!file) throw new Error('No file provided');
      formData.append('image', file);
    } else {
      throw new Error('Unsupported type');
    }
    const response = await fetch(backendUrl, {
      method: 'POST',
      body: formData,
    });
    if (!response.ok) {
      throw new Error(`Backend error: ${response.status}`);
    }
    const result = await response.json();
    return result.parsed || result;
  }

  function handleSubmit(e) {
    e.preventDefault();
    const file = fileInputRef.current?.files?.[0];
    const url = linkInputRef.current?.value;
    
    if (file) {
      handleImageScan();
    } else if (url) {
      handleLinkScan();
    } else {
      alert('Please upload an image or enter a URL');
    }
  }

  async function handleImageScan() {
    setSubmitting(true);
    setResult(null);
    try {
      const file = fileInputRef.current?.files?.[0];
      if (!file) {
        alert('Please upload an image');
        setSubmitting(false);
        return;
      }
      const parsed = await callBackendAPI({ type: 'image', file });
      const engine = runRuleEngine(parsed);
      const log = {
        id: `check_${Date.now()}`,
        submitted_by: 'user',
        product_preview: parsed.product_name || 'Unknown product',
        input_type: 'image',
        parsed,
        ...engine,
        timestamp: new Date().toISOString(),
        highlight: engine.status === 'rejected' || engine.compliance_score < 100,
        rules: {
          rule1: Math.floor(Math.random() * 100),
          rule2: Math.floor(Math.random() * 100),
          rule3: Math.floor(Math.random() * 100),
          rule4: Math.floor(Math.random() * 100),
          rule5: Math.floor(Math.random() * 100)
        }
      };
      setResult(log);
      setLogs((s) => [log, ...s]);
    } catch (err) {
      setResult({ status: 'rejected', reason: err.message, violations: [], compliance_score: 0 });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleLinkScan() {
    setSubmitting(true);
    setResult(null);
    try {
      const url = linkInputRef.current?.value?.trim();
      if (!url) {
        alert('Please enter a link');
        setSubmitting(false);
        return;
      }
      const parsed = await callBackendAPI({ type: 'url', url });
      const engine = runRuleEngine(parsed);
      const log = {
        id: `check_${Date.now()}`,
        submitted_by: 'user',
        product_preview: parsed.product_name || 'Unknown product',
        input_type: 'link',
        parsed,
        ...engine,
        timestamp: new Date().toISOString(),
        highlight: engine.status === 'rejected' || engine.compliance_score < 100,
        rules: {
          rule1: Math.floor(Math.random() * 100),
          rule2: Math.floor(Math.random() * 100),
          rule3: Math.floor(Math.random() * 100),
          rule4: Math.floor(Math.random() * 100),
          rule5: Math.floor(Math.random() * 100)
        }
      };
      setResult(log);
      setLogs((s) => [log, ...s]);
    } catch (err) {
      setResult({ status: 'rejected', reason: err.message, violations: [], compliance_score: 0 });
    } finally {
      setSubmitting(false);
    }
  }

  // Fetch analytics data from backend
  async function fetchAnalytics() {
    setAnalyticsLoading(true);
    setAnalyticsError(null);
    try {
      const [trendRes, brandsRes, statsRes] = await Promise.all([
        fetch(`${API_BASE_URL}/api/analytics/trend`).then(r => r.json()),
        fetch(`${API_BASE_URL}/api/analytics/brands`).then(r => r.json()),
        fetch(`${API_BASE_URL}/api/analytics/stats`).then(r => r.json())
      ]);
      
      // Transform trend data for the chart
      const transformedTrendData = Array.isArray(trendRes) ? trendRes.map(item => ({
        x: item.x,
        compliance: item.compliance,
        date: item.date,
        submissions: item.submissions
      })) : [];
      
      // Transform brand data for the chart
      const transformedBrandData = Array.isArray(brandsRes) ? brandsRes.map(item => ({
        brand: item.brand,
        violations: item.violations,
        submissions: item.submissions,
        avg_score: item.avg_score
      })) : [];
      
      setTrendData(transformedTrendData);
      setBrandViolations(transformedBrandData);
      setOverallStats(statsRes);
    } catch (err) {
      console.error('Analytics fetch error:', err);
      setAnalyticsError('Failed to load analytics');
      
      // Fallback to mock data if API fails
      const mockTrendData = [
        { x: 'Day 1', compliance: 85, date: '2023-05-01', submissions: 5 },
        { x: 'Day 2', compliance: 78, date: '2023-05-02', submissions: 3 },
        { x: 'Day 3', compliance: 92, date: '2023-05-03', submissions: 7 },
        { x: 'Day 4', compliance: 88, date: '2023-05-04', submissions: 4 },
        { x: 'Day 5', compliance: 95, date: '2023-05-05', submissions: 6 }
      ];
      
      const mockBrandViolations = [
        { brand: 'Brand A', violations: 12, submissions: 8, avg_score: 75 },
        { brand: 'Brand B', violations: 8, submissions: 5, avg_score: 82 },
        { brand: 'Brand C', violations: 15, submissions: 10, avg_score: 68 },
        { brand: 'Brand D', violations: 5, submissions: 3, avg_score: 88 },
        { brand: 'Brand E', violations: 10, submissions: 7, avg_score: 72 }
      ];
      
      setTrendData(mockTrendData);
      setBrandViolations(mockBrandViolations);
    } finally {
      setAnalyticsLoading(false);
    }
  }

  // Fetch analytics on mount and after every scan
  useEffect(() => {
    fetchAnalytics();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Refetch analytics after a scan is performed
  useEffect(() => {
    if (result !== null) {
      fetchAnalytics();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result]);

  // Simple visual helpers
  function statusColor(status) {
    if (status === 'approved') return 'bg-green-100 text-green-800';
    if (status === 'failed') return 'bg-yellow-100 text-yellow-800';
    return 'bg-red-100 text-red-800';
  }

  // Handle viewing a previous submission
  function viewSubmission(submission) {
    setSelectedSubmission(submission);
    setResult(submission);
  }

  function clearSelection() {
    setSelectedSubmission(null);
    setResult(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (linkInputRef.current) linkInputRef.current.value = '';
  }

  // Custom tooltip for compliance trend
  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white p-3 border border-gray-200 rounded shadow-md">
          <p className="font-semibold">{`${label}`}</p>
          <p className="text-blue-600">{`Compliance: ${payload[0].value}%`}</p>
          {payload[0].payload.date && (
            <p className="text-gray-600">{`Date: ${payload[0].payload.date}`}</p>
          )}
          {payload[0].payload.submissions && (
            <p className="text-gray-600">{`Submissions: ${payload[0].payload.submissions}`}</p>
          )}
        </div>
      );
    }
    return null;
  };

  // Custom tooltip for brand violations
  const BrandTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white p-3 border border-gray-200 rounded shadow-md">
          <p className="font-semibold">{`Brand: ${label}`}</p>
          <p className="text-red-600">{`Violations: ${payload[0].value}`}</p>
          {payload[0].payload.submissions && (
            <p className="text-gray-600">{`Submissions: ${payload[0].payload.submissions}`}</p>
          )}
          {payload[0].payload.avg_score && (
            <p className="text-gray-600">{`Avg Score: ${payload[0].payload.avg_score}%`}</p>
          )}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-800 to-indigo-900 text-white p-4 shadow-md">
        <div className="container mx-auto flex justify-between items-center">
          <h1 className="text-2xl font-bold">CompliScan Dashboard</h1>
          {overallStats && (
            <div className="hidden md:flex space-x-4 text-sm">
              <div className="bg-blue-700 bg-opacity-50 px-3 py-1 rounded">
                <span className="font-semibold">{overallStats.total_submissions || 0}</span> Scans
              </div>
              <div className="bg-green-700 bg-opacity-50 px-3 py-1 rounded">
                <span className="font-semibold">{Math.round(overallStats.avg_compliance_score || 0)}%</span> Avg Score
              </div>
            </div>
          )}
        </div>
      </div>

      <main className="container mx-auto p-4 grid grid-cols-1 md:grid-cols-4 gap-6">
        {/* Left sidebar: input form and filters */}
        <section className="md:col-span-1">
          <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
            <h2 className="text-xl font-semibold mb-4 flex items-center">
              <span className="mr-2">🔍</span>
              Product Scanner
            </h2>
            
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="bg-gray-50 p-4 rounded-lg border-2 border-dashed border-gray-200 hover:border-emerald-300 transition-all duration-300 hover:bg-emerald-50">
                <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center">
                  <span className="mr-2">📷</span>
                  Product Image
                </label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-emerald-50 file:text-emerald-700 hover:file:bg-emerald-100 transition-all duration-200"
                />
                <p className="text-xs text-gray-500 mt-1">JPG, PNG, GIF, WebP (max 10MB)</p>
              </div>

              <div className="text-center">
                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-gray-200"></div>
                  </div>
                  <div className="relative flex justify-center text-sm">
                    <span className="px-3 bg-white text-gray-500 rounded-full">OR</span>
                  </div>
                </div>
              </div>

              <div className="bg-gray-50 p-4 rounded-lg border-2 border-dashed border-gray-200 hover:border-emerald-300 transition-all duration-300 hover:bg-emerald-50">
                <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center">
                  <span className="mr-2">🔗</span>
                  Product URL
                </label>
                <input
                  name="url"
                  type="text"
                  placeholder="https://amazon.in | flipkart.com | myntra.com"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm transition-all duration-200"
                  ref={linkInputRef}
                />
                <p className="text-xs text-gray-500 mt-1">Any e-commerce website URL</p>
              </div>

              <div className="flex space-x-3">
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 bg-gradient-to-r from-emerald-600 to-blue-600 text-white py-3 px-4 rounded-lg font-medium hover:from-emerald-700 hover:to-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300 transform hover:scale-105 hover:shadow-lg"
                >
                  {submitting ? (
                    <div className="flex items-center justify-center">
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                      <span className="animate-pulse">Analyzing with AI...</span>
                    </div>
                  ) : (
                    '🚀 Scan Now'
                  )}
                </button>
                <button
                  type="button"
                  onClick={clearSelection}
                  className="px-4 py-3 border border-gray-300 rounded-lg hover:bg-gray-50 transition-all duration-200 transform hover:scale-105"
                >
                  Clear
                </button>
              </div>
            </form>

            {/* Quick status summary in sidebar */}
            {result && (
              <div className="mt-6 pt-6 border-t border-gray-200">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-gray-700">
                    {selectedSubmission ? '📋 Viewing Previous Scan' : '✨ Latest Scan'}
                  </h3>
                  {selectedSubmission && (
                    <button
                      onClick={clearSelection}
                      className="text-xs text-blue-600 hover:text-blue-800 underline"
                    >
                      New Scan
                    </button>
                  )}
                </div>
                <div className={`p-4 rounded-lg ${
                  result.status === 'approved' ? 'bg-green-50 border border-green-200' : 
                  result.status === 'failed' ? 'bg-yellow-50 border border-yellow-200' : 
                  'bg-red-50 border border-red-200'
                }`}>
                  <div className="flex items-center justify-between mb-2">
                    <span className={`font-semibold ${
                      result.status === 'approved' ? 'text-green-800' : 
                      result.status === 'failed' ? 'text-yellow-800' : 'text-red-800'
                    }`}>
                      {result.status === 'approved' ? '✓ Compliant' : 
                        result.status === 'failed' ? '⚠ Needs Review' : '✗ Non-Compliant'}
                    </span>
                    <span className="text-sm font-medium">{result.compliance_score}%</span>
                  </div>
                  {result.violations?.length > 0 && (
                    <p className="text-xs text-gray-600">
                      {result.violations.length} issue{result.violations.length !== 1 ? 's' : ''} found
                    </p>
                  )}
                  {selectedSubmission && (
                    <p className="text-xs text-gray-500 mt-2">
                      📅 {new Date(selectedSubmission.timestamp).toLocaleString()}
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Main content: scan/results, analytics, logs */}
        <div className="col-span-2 md:col-span-3">
          {/* Scan/result area */}
          <div className="space-y-6">
            {result ? (
              <>
                {/* Status Header */}
                <div className="bg-white rounded-xl shadow-lg p-6 border-l-4 border-emerald-500">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center space-x-3">
                      <div className={`w-12 h-12 rounded-full flex items-center justify-center text-white text-xl font-bold ${
                        result.status === 'approved' ? 'bg-gradient-to-br from-emerald-500 to-green-600' : 
                        result.status === 'failed' ? 'bg-gradient-to-br from-yellow-500 to-orange-600' : 'bg-gradient-to-br from-red-500 to-pink-600'
                      }`}>
                        {result.status === 'approved' ? '✓' : result.status === 'failed' ? '⚠' : '✗'}
                      </div>
                      <div>
                        <h3 className="text-xl font-bold text-gray-800">
                          {result.status === 'approved' ? '✅ Fully Compliant' : 
                            result.status === 'failed' ? '⚠️ Needs Review' : '❌ Non-Compliant'}
                        </h3>
                        <p className="text-gray-600">CompliScan Score: {result.compliance_score}%</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-3xl font-bold bg-gradient-to-r from-emerald-600 to-blue-600 bg-clip-text text-transparent">
                        {result.compliance_score}%
                      </div>
                      <div className="text-sm text-gray-500">Legal Metrology</div>
                    </div>
                  </div>
                </div>

                {/* Product Information Card */}
                <div className="bg-white rounded-xl shadow-lg overflow-hidden">
                  <div className="bg-gradient-to-r from-emerald-50 to-blue-50 px-6 py-4 border-b">
                    <h4 className="text-lg font-semibold text-gray-800 flex items-center">
                      <span className="mr-2">📦</span>
                      Legal Metrology Fields
                    </h4>
                  </div>
                  <div className="p-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-3">
                        <div className="flex justify-between py-2 border-b border-gray-100">
                          <span className="font-medium text-gray-600">Product Name:</span>
                          <span className="text-gray-800 text-right max-w-xs truncate" title={result.parsed?.product_name}>
                            {result.parsed?.product_name || '❌ Missing'}
                          </span>
                        </div>
                        <div className="flex justify-between py-2 border-b border-gray-100">
                          <span className="font-medium text-gray-600">MRP:</span>
                          <span className="text-gray-800">{result.parsed?.MRP || '❌ Missing'}</span>
                        </div>
                        <div className="flex justify-between py-2 border-b border-gray-100">
                          <span className="font-medium text-gray-600">Manufacturer:</span>
                          <span className="text-gray-800">{result.parsed?.manufacturer || '❌ Missing'}</span>
                        </div>
                      </div>
                      <div className="space-y-3">
                        <div className="flex justify-between py-2 border-b border-gray-100">
                          <span className="font-medium text-gray-600">Net Quantity:</span>
                          <span className="text-gray-800">{result.parsed?.net_quantity || '❌ Missing'}</span>
                        </div>
                        <div className="flex justify-between py-2 border-b border-gray-100">
                          <span className="font-medium text-gray-600">Country of Origin:</span>
                          <span className="text-gray-800">{result.parsed?.country_of_origin || '❌ Missing'}</span>
                        </div>
                        {result.parsed?.ai_enhanced && (
                          <div className="flex justify-between py-2 border-b border-gray-100">
                            <span className="font-medium text-purple-600">AI Enhanced:</span>
                            <span className="text-purple-600">✨ Yes</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Violations & Issues */}
                {(result.violations?.length > 0 || result.reasons?.length > 0) && (
                  <div className="bg-white rounded-xl shadow-lg overflow-hidden">
                    <div className="bg-gradient-to-r from-red-50 to-pink-50 px-6 py-4 border-b border-red-100">
                      <h4 className="text-lg font-semibold text-red-800 flex items-center">
                        <span className="mr-2">⚠️</span>
                        CompliScan Issues Detected
                      </h4>
                    </div>
                    <div className="p-6 space-y-4">
                      {result.violations?.length > 0 && (
                        <div>
                          <h5 className="font-semibold text-gray-800 mb-2">Compliance Violations:</h5>
                          <ul className="space-y-2">
                            {result.violations.map((violation, i) => (
                              <li key={i} className="flex items-center space-x-2 text-red-600">
                                <span className="w-2 h-2 bg-red-500 rounded-full"></span>
                                <span>{violation}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {result.reasons?.length > 0 && (
                        <div>
                          <h5 className="font-semibold text-gray-800 mb-2">Quality Issues:</h5>
                          <ul className="space-y-2">
                            {result.reasons.map((reason, i) => (
                              <li key={i} className="flex items-center space-x-2 text-yellow-600">
                                <span className="w-2 h-2 bg-yellow-500 rounded-full"></span>
                                <span>{reason}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Action Buttons - Redesigned */}
                <div className="bg-white rounded-xl shadow-lg p-6">
                  <h4 className="text-lg font-semibold text-gray-800 mb-4">🚀 Next Steps</h4>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <button className="flex flex-col items-center p-4 border-2 border-green-200 rounded-lg hover:border-green-400 hover:bg-green-50 transition-all group">
                      <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mb-2 group-hover:bg-green-200">
                        <span className="text-green-600 text-xl">✓</span>
                      </div>
                      <span className="font-medium text-green-700">Approve Product</span>
                      <span className="text-xs text-gray-500 text-center mt-1">Product meets all requirements</span>
                    </button>
                    
                    <button className="flex flex-col items-center p-4 border-2 border-yellow-200 rounded-lg hover:border-yellow-400 hover:bg-yellow-50 transition-all group">
                      <div className="w-12 h-12 bg-yellow-100 rounded-full flex items-center justify-center mb-2 group-hover:bg-yellow-200">
                        <span className="text-yellow-600 text-xl">📝</span>
                      </div>
                      <span className="font-medium text-yellow-700">Request Fix</span>
                      <span className="text-xs text-gray-500 text-center mt-1">Ask seller to update product info</span>
                    </button>
                    
                    <button className="flex flex-col items-center p-4 border-2 border-purple-200 rounded-lg hover:border-purple-400 hover:bg-purple-50 transition-all group">
                      <div className="w-12 h-12 bg-purple-100 rounded-full flex items-center justify-center mb-2 group-hover:bg-purple-200">
                        <span className="text-purple-600 text-xl">👥</span>
                      </div>
                      <span className="font-medium text-purple-700">Manual Review</span>
                      <span className="text-xs text-gray-500 text-center mt-1">Send to compliance team</span>
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <div className="bg-white rounded-xl shadow-lg p-12 text-center">
                <div className="w-24 h-24 bg-gradient-to-br from-emerald-100 to-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <span className="text-emerald-500 text-3xl">🔍</span>
                </div>
                <h3 className="text-xl font-semibold text-gray-800 mb-2">Ready to Scan with CompliScan</h3>
                <p className="text-gray-600">Upload a product image or paste an e-commerce URL to instantly verify all 6 mandatory Legal Metrology requirements.</p>
              </div>
            )}
          </div>

          {/* --- Always show analytics section below scan/results --- */}
          <div className="mt-8">
            <h2 className="text-xl font-bold mb-4 text-gray-800">📊 Compliance Analytics</h2>
            {analyticsLoading ? (
              <div className="text-center text-blue-500 mb-4">Loading analytics...</div>
            ) : analyticsError ? (
              <div className="text-center text-red-500 mb-4">{analyticsError}</div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Compliance Trend */}
                <div className="bg-white p-4 rounded shadow">
                  <h3 className="font-semibold mb-3 flex items-center justify-between">
                    Compliance Trend (Last 30 Days)
                    {trendData.length > 0 && (
                      <span className="text-sm text-gray-500">
                        Avg: {Math.round(trendData.reduce((sum, item) => sum + item.compliance, 0) / trendData.length)}%
                      </span>
                    )}
                  </h3>
                  {trendData.length === 0 ? (
                    <div className="text-sm text-gray-600">
                      No compliance data yet.
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height={200}>
                      <LineChart data={trendData}>
                        <XAxis 
                          dataKey="x" 
                          tick={{ fontSize: 10 }}
                          axisLine={{ stroke: '#e5e7eb' }}
                        />
                        <YAxis 
                          domain={[0, 100]}
                          tick={{ fontSize: 10 }}
                          axisLine={{ stroke: '#e5e7eb' }}
                        />
                        <Tooltip content={<CustomTooltip />} />
                        <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                        <Line 
                          type="monotone" 
                          dataKey="compliance" 
                          stroke="#2563eb"
                          strokeWidth={2}
                          dot={{ fill: '#2563eb', strokeWidth: 2, r: 3 }}
                          activeDot={{ r: 5, stroke: '#2563eb', strokeWidth: 2, fill: '#fff' }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  )}
                </div>
                {/* Violations by Brand */}
                <div className="bg-white p-4 rounded shadow">
                  <h3 className="font-semibold mb-3 flex items-center justify-between">
                    Violations by Brand
                    {brandViolations.length > 0 && (
                      <span className="text-sm text-gray-500">
                        Total: {brandViolations.reduce((sum, item) => sum + item.violations, 0)}
                      </span>
                    )}
                  </h3>
                  {brandViolations.length === 0 ? (
                    <div className="text-sm text-gray-600">
                      No violations yet.
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height={200}>
                      <BarChart data={brandViolations}>
                        <XAxis 
                          dataKey="brand" 
                          tick={{ fontSize: 10 }}
                          angle={-45}
                          textAnchor="end"
                          height={60}
                        />
                        <YAxis />
                        <Tooltip content={<BrandTooltip />} />
                        <CartesianGrid strokeDasharray="3 3" />
                        <Bar dataKey="violations" fill="#ef4444" name="Violations" />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </div>
            )}
          </div>
          {/* --- End analytics section --- */}

          {/* Bottom: submission logs */}
          <div className="bg-white rounded-xl shadow-lg p-6 mt-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-800 flex items-center">
                <span className="mr-2">📋</span>
                Submission History ({logs.length})
              </h3>
              {logs.length > 0 && (
                <button
                  onClick={() => {
                    if (confirm('Clear all submission history? This cannot be undone.')) {
                      setLogs([]);
                      setResult(null);
                      setSelectedSubmission(null);
                    }
                  }}
                  className="text-xs text-red-600 hover:text-red-800 underline"
                >
                  Clear All
                </button>
              )}
            </div>
            {logs.length > 0 ? 
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {logs.map((log) => (
                  <div 
                    key={log.id} 
                    onClick={() => viewSubmission(log)}
                    className={`p-4 rounded-lg border cursor-pointer ${
                      selectedSubmission?.id === log.id 
                        ? 'border-emerald-500 bg-emerald-50' 
                        : log.highlight 
                          ? 'border-red-200 bg-red-50 hover:bg-red-100' 
                          : 'border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    <div className="flex items-center justify-between text-sm mb-2">
                      <span className="font-medium text-gray-800 flex items-center">
                        <span className="mr-2">
                          {log.input_type === 'image'}
                          {log.input_type === 'image' ? '📷' : '🔗'}
                        </span>
                        {log.product_preview}
                      </span>
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusColor(log.status)}`}>
                        {log.status}
                      </span>
                    </div>
                    <div className="text-xs text-gray-500 flex items-center justify-between">
                      <span>
                        📅 {new Date(log.timestamp).toLocaleString()}
                      </span>
                      <div className="flex items-center space-x-3">
                        <span className="font-medium">
                          🎯 Score: {log.compliance_score}%
                        </span>
                        {log.violations?.length > 0 && (
                          <span className="text-red-600">
                            ⚠️ {log.violations.length} issue{log.violations.length !== 1 ? 's' : ''}
                          </span>
                        )}
                      </div>
                    </div>
                    {selectedSubmission?.id === log.id && (
                      <div className="mt-2 pt-2 border-t border-emerald-200">
                        <span className="text-xs text-emerald-700 font-medium">
                          👆 Currently viewing this submission
                        </span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            : (
              <div className="text-center py-8">
                <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3">
                  <span className="text-gray-400 text-xl">📋</span>
                </div>
                <p className="text-sm text-gray-600">No submissions yet.</p>
                <p className="text-xs text-gray-500 mt-1">Your scan history will appear here</p>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}