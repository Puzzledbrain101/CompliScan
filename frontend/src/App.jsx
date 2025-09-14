// File: src/App.jsx
// ComplianceApp component (single-file demo). Replace mockParseInput with real API calls in production.
import React, { useState, useRef } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer, BarChart, Bar } from 'recharts';

export default function ComplianceApp() {
  const [view, setView] = useState('seller'); // seller | backend
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const [logs, setLogs] = useState(() => {
    // Load submissions from localStorage on initialization
    try {
      const savedLogs = localStorage.getItem('compliscan_submissions');
      return savedLogs ? JSON.parse(savedLogs) : [];
    } catch (error) {
      console.warn('Failed to load saved submissions:', error);
      return [];
    }
  });
  const [selectedSubmission, setSelectedSubmission] = useState(null);
  const fileInputRef = useRef();
  
  // Analytics state
  const [analyticsData, setAnalyticsData] = useState({
    brands: [],
    trend: [],
    stats: {},
    loading: false,
    error: null
  });

  // Save submissions to localStorage whenever logs change
  React.useEffect(() => {
    try {
      localStorage.setItem('compliscan_submissions', JSON.stringify(logs));
    } catch (error) {
      console.warn('Failed to save submissions:', error);
    }
  }, [logs]);

  // Analytics API functions
  async function fetchAnalytics() {
    setAnalyticsData(prev => ({ ...prev, loading: true, error: null }));
    
    try {
      const [brandsRes, trendRes, statsRes] = await Promise.all([
        fetch('/api/analytics/brands'),
        fetch('/api/analytics/trend'),
        fetch('/api/analytics/stats')
      ]);

      if (!brandsRes.ok || !trendRes.ok || !statsRes.ok) {
        throw new Error('Failed to fetch analytics data');
      }

      const [brands, trend, stats] = await Promise.all([
        brandsRes.json(),
        trendRes.json(),
        statsRes.json()
      ]);

      setAnalyticsData({
        brands,
        trend,
        stats,
        loading: false,
        error: null
      });
    } catch (error) {
      console.error('Failed to fetch analytics:', error);
      setAnalyticsData(prev => ({
        ...prev,
        loading: false,
        error: error.message
      }));
    }
  }

  // Load analytics when switching to backend view
  React.useEffect(() => {
    if (view === 'backend') {
      fetchAnalytics();
    }
  }, [view]);

  // Mock rule engine run on parsed fields
  function runRuleEngine(parsed) {
    const required = ['product_name', 'MRP', 'manufacturer', 'net_quantity', 'country_of_origin'];
    const violations = [];
    required.forEach((k) => {
      if (!parsed[k]) violations.push(`${k} missing`);
    });

    // Simple OCR quality checks
    const reasons = [];
    if (parsed._ocr_confidence && parsed._ocr_confidence < 0.6) reasons.push('Low OCR confidence (text unclear)');
    if (parsed._image_resolution && (parsed._image_resolution.width < 400 || parsed._image_resolution.height < 300)) reasons.push('Low resolution image');

    const score = Math.max(0, Math.round((1 - violations.length / required.length - (reasons.length * 0.05)) * 100));

    const status = violations.length === 0 && reasons.length === 0 ? 'approved' : (reasons.length > 0 && violations.length === 0 ? 'rejected' : 'failed');

    return {
      compliance_score: score,
      violations,
      reasons,
      status,
    };
  }

  // Function to call the backend API
  async function callBackendAPI({ type, file, url }) {
    const backendUrl = `/api/check`;
    
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

  async function handleSubmit(event) {
    event?.preventDefault?.();
    setSubmitting(true);
    setResult(null);
    setSelectedSubmission(null); // Clear previous submission selection for new scans

    try {
      const file = fileInputRef.current?.files?.[0];
      const url = event?.target?.url?.value?.trim();

      if (!file && !url) {
        alert('Please upload an image or paste a URL');
        setSubmitting(false);
        return;
      }

      const type = file ? 'image' : 'url';
      const parsed = await callBackendAPI({ type, file, url });
      const engine = runRuleEngine(parsed);

      const log = {
        id: `check_${Date.now()}`,
        submitted_by: 'seller_demo',
        product_preview: parsed.product_name || 'Unknown product',
        input_type: type,
        parsed,
        ...engine,
        timestamp: new Date().toISOString(),
        highlight: engine.status === 'rejected' || engine.compliance_score < 100,
      };

      setResult(log);
      setLogs((s) => [log, ...s]);

    } catch (err) {
      setResult({ status: 'rejected', reason: err.message, violations: [], compliance_score: 0 });
    } finally {
      setSubmitting(false);
    }
  }

  // Simple visual helpers
  function statusColor(status) {
    if (status === 'approved') return 'bg-green-100 text-green-800';
    if (status === 'failed') return 'bg-yellow-100 text-yellow-800';
    return 'bg-red-100 text-red-800';
  }

  // Handle viewing a previous submission
  function viewSubmission(submission) {
    setResult(submission);
    setSelectedSubmission(submission);
  }

  // Clear selected submission and reset to new scan mode
  function clearSelection() {
    setResult(null);
    setSelectedSubmission(null);
    if (fileInputRef.current) fileInputRef.current.value = null;
  }

  // Analytics data - use real backend data when available, fallback to local logs
  const trendData = analyticsData.trend.length > 0 
    ? analyticsData.trend 
    : logs.slice(0, 12).reverse().map((l, i) => ({ x: i + 1, compliance: l.compliance_score }));
    
  const brandViolations = analyticsData.brands.length > 0 
    ? analyticsData.brands
    : [{ brand: 'DemoLabs', violations: logs.filter(l => l.parsed?.manufacturer?.toLowerCase()?.includes('demolabs')).length }, { brand: 'SkinCo Labs', violations: logs.filter(l => l.parsed?.manufacturer?.toLowerCase()?.includes('skinco')).length }];

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <header className="max-w-6xl mx-auto mb-6 flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <div className="w-12 h-12 bg-gradient-to-br from-emerald-400 to-blue-500 rounded-xl flex items-center justify-center shadow-lg">
            <span className="text-white font-bold text-xl">📊</span>
          </div>
          <div>
            <h1 className="text-2xl font-bold bg-gradient-to-r from-emerald-300 to-blue-300 bg-clip-text text-transparent">
              CompliScan
            </h1>
            <p className="text-white/70 text-sm">Legal Metrology Compliance Checker</p>
          </div>
        </div>
        <div className="space-x-2">
          <button 
            onClick={() => setView('seller')} 
            className={`px-4 py-2 rounded-xl transition-all duration-300 transform hover:scale-105 ${
              view==='seller' 
                ? 'bg-gradient-to-r from-emerald-500 to-blue-500 text-white shadow-lg' 
                : 'bg-white/20 backdrop-blur-sm border border-white/30 text-white hover:bg-white/30'
            }`}
          >
            🏪 Seller View
          </button>
          <button 
            onClick={() => setView('backend')} 
            className={`px-4 py-2 rounded-xl transition-all duration-300 transform hover:scale-105 ${
              view==='backend' 
                ? 'bg-gradient-to-r from-emerald-500 to-blue-500 text-white shadow-lg' 
                : 'bg-white/20 backdrop-blur-sm border border-white/30 text-white hover:bg-white/30'
            }`}
          >
            📈 Analytics
          </button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Left column: form or filters */}
        <section className="col-span-1 md:col-span-1">
          {view === 'seller' ? (
            <div className="bg-white rounded-xl shadow-lg p-6 transition-all duration-500 hover:shadow-2xl hover:scale-[1.02]">
              <div className="bg-gradient-to-r from-emerald-50 to-blue-50 p-4 rounded-lg mb-6 border border-emerald-100">
                <h2 className="text-lg font-semibold text-gray-800 mb-2 flex items-center">
                  <span className="mr-2">🔍</span>
                  CompliScan Checker
                </h2>
                <p className="text-sm text-gray-600">
                  Instantly verify all 6 mandatory Legal Metrology requirements. Upload product images or paste URLs from any e-commerce platform.
                </p>
              </div>

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
                    onClick={() => { 
                      if (fileInputRef.current) fileInputRef.current.value = null; 
                      setResult(null);
                      setSelectedSubmission(null); // Clear selection state
                    }}
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
          ) : (
            <div>
              <h2 className="font-semibold mb-2">Filters</h2>
              <p className="text-sm text-gray-600">Filter the backend panel by status, date, seller, etc. (demo-only UI)</p>
            </div>
          )}
        </section>

        {/* Middle column: comprehensive compliance results */}
        <section className="col-span-2 md:col-span-2">
          {view === 'seller' ? (
            <div className="space-y-6">
              {result ? (
                <>
                  {/* Status Header */}
                  <div className="bg-white rounded-xl shadow-lg p-6 border-l-4 border-emerald-500 animate-fadeIn">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center space-x-3">
                        <div className={`w-12 h-12 rounded-full flex items-center justify-center text-white text-xl font-bold transition-all duration-500 transform hover:scale-110 ${
                          result.status === 'approved' ? 'bg-gradient-to-br from-emerald-500 to-green-600' : 
                          result.status === 'failed' ? 'bg-gradient-to-br from-yellow-500 to-orange-600' : 'bg-gradient-to-br from-red-500 to-pink-600'
                        }`}>
                          {result.status === 'approved' ? '✓' : result.status === 'failed' ? '⚠' : '✗'}
                        </div>
                        <div>
                          <h3 className="text-xl font-bold text-gray-800 animate-slideIn">
                            {result.status === 'approved' ? '✅ Fully Compliant' : 
                             result.status === 'failed' ? '⚠️ Needs Review' : '❌ Non-Compliant'}
                          </h3>
                          <p className="text-gray-600">CompliScan Score: {result.compliance_score}%</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-3xl font-bold bg-gradient-to-r from-emerald-600 to-blue-600 bg-clip-text text-transparent animate-pulse">
                          {result.compliance_score}%
                        </div>
                        <div className="text-sm text-gray-500">Legal Metrology</div>
                      </div>
                    </div>
                  </div>

                  {/* Product Information Card */}
                  <div className="bg-white rounded-xl shadow-lg overflow-hidden animate-slideUp">
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
                    <div className="bg-white rounded-xl shadow-lg overflow-hidden animate-bounceIn">
                      <div className="bg-gradient-to-r from-red-50 to-pink-50 px-6 py-4 border-b border-red-100">
                        <h4 className="text-lg font-semibold text-red-800 flex items-center">
                          <span className="mr-2 animate-pulse">⚠️</span>
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
                <div className="bg-white rounded-xl shadow-lg p-12 text-center animate-fadeIn">
                  <div className="w-24 h-24 bg-gradient-to-br from-emerald-100 to-blue-100 rounded-full flex items-center justify-center mx-auto mb-4 transition-all duration-300 hover:scale-110">
                    <span className="text-emerald-500 text-3xl animate-bounce">🔍</span>
                  </div>
                  <h3 className="text-xl font-semibold text-gray-800 mb-2">Ready to Scan with CompliScan</h3>
                  <p className="text-gray-600">Upload a product image or paste an e-commerce URL to instantly verify all 6 mandatory Legal Metrology requirements.</p>
                </div>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-white p-4 rounded shadow">
                <h3 className="font-semibold mb-3 flex items-center justify-between">
                  Compliance Trend
                  {analyticsData.loading && (
                    <div className="text-xs text-blue-500 flex items-center">
                      <div className="w-3 h-3 border border-blue-500 border-t-transparent rounded-full animate-spin mr-2"></div>
                      Loading...
                    </div>
                  )}
                </h3>
                {analyticsData.error && trendData.length === 0 ? (
                  <div className="text-sm text-red-600 p-2 bg-red-50 rounded">
                    Error: {analyticsData.error}
                  </div>
                ) : trendData.length > 0 ? (
                  <>
                    {analyticsData.error && (
                      <div className="text-xs text-yellow-600 p-2 bg-yellow-50 rounded mb-2">
                        Using local data (API error: {analyticsData.error})
                      </div>
                    )}
                  <ResponsiveContainer width="100%" height={200}>
                    <LineChart data={trendData}>
                      <XAxis 
                        dataKey="x" 
                        tick={{ fontSize: 12 }}
                        axisLine={{ stroke: '#e5e7eb' }}
                      />
                      <YAxis 
                        domain={[0, 100]}
                        tick={{ fontSize: 12 }}
                        axisLine={{ stroke: '#e5e7eb' }}
                        label={{ value: 'Compliance %', angle: -90, position: 'insideLeft' }}
                      />
                      <Tooltip 
                        formatter={(value, name) => [`${value}%`, name === 'compliance' ? 'Compliance Score' : name]}
                        labelFormatter={(label, payload) => {
                          if (payload && payload[0] && payload[0].payload.date) {
                            return `Date: ${payload[0].payload.date}`;
                          }
                          return `Point: ${label}`;
                        }}
                        contentStyle={{
                          backgroundColor: '#fff',
                          border: '1px solid #e5e7eb',
                          borderRadius: '8px',
                          boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                        }}
                      />
                      <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                      <Line 
                        type="monotone" 
                        dataKey="compliance" 
                        stroke="#2563eb"
                        strokeWidth={3}
                        dot={{ fill: '#2563eb', strokeWidth: 2, r: 4 }}
                        activeDot={{ r: 6, stroke: '#2563eb', strokeWidth: 2, fill: '#fff' }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                  </>
                ) : (
                  <div className="text-sm text-gray-600">
                    {analyticsData.loading ? 'Loading trend data...' : 'No compliance data yet.'}
                  </div>
                )}
              </div>

              <div className="bg-white p-4 rounded shadow">
                <h3 className="font-semibold mb-3 flex items-center justify-between">
                  Violations by Brand
                  {analyticsData.loading && (
                    <div className="text-xs text-blue-500 flex items-center">
                      <div className="w-3 h-3 border border-blue-500 border-t-transparent rounded-full animate-spin mr-2"></div>
                      Loading...
                    </div>
                  )}
                </h3>
                {analyticsData.error ? (
                  <div className="text-sm text-red-600 p-2 bg-red-50 rounded">
                    Error: {analyticsData.error}
                  </div>
                ) : brandViolations.length > 0 && brandViolations.some(b => b.violations > 0) ? (
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={brandViolations}>
                      <XAxis dataKey="brand" />
                      <YAxis />
                      <Tooltip formatter={(value, name) => [value, name === 'violations' ? 'Violations' : name]} />
                      <CartesianGrid strokeDasharray="3 3" />
                      <Bar dataKey="violations" fill="#ef4444" />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="text-sm text-gray-600">
                    {analyticsData.loading ? 'Loading violations data...' : 'No violations yet.'}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Bottom: submission logs */}
          <div className="bg-white rounded-xl shadow-lg p-6 mt-6 transition-all duration-300 hover:shadow-xl">
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
            {logs.length > 0 ? (
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {logs.map((log) => (
                  <div 
                    key={log.id} 
                    onClick={() => viewSubmission(log)}
                    className={`p-4 rounded-lg border cursor-pointer transition-all duration-200 hover:shadow-md hover:border-emerald-300 ${
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
            ) : (
              <div className="text-center py-8">
                <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3">
                  <span className="text-gray-400 text-xl">📋</span>
                </div>
                <p className="text-sm text-gray-600">No submissions yet.</p>
                <p className="text-xs text-gray-500 mt-1">Your scan history will appear here</p>
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
