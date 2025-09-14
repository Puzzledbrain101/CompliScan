// File: src/App.jsx
// ComplianceApp component (single-file demo). Replace mockParseInput with real API calls in production.
import React, { useState, useRef } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer, BarChart, Bar } from 'recharts';

export default function ComplianceApp() {
  const [view, setView] = useState('seller'); // seller | backend
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const [logs, setLogs] = useState([]);
  const fileInputRef = useRef();

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

  // Small analytics
  const trendData = logs.slice(0, 12).reverse().map((l, i) => ({ x: i + 1, compliance: l.compliance_score }));
  const brandViolations = [{ brand: 'DemoLabs', violations: logs.filter(l => l.parsed?.manufacturer?.toLowerCase()?.includes('demolabs')).length }, { brand: 'SkinCo Labs', violations: logs.filter(l => l.parsed?.manufacturer?.toLowerCase()?.includes('skinco')).length }];

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <header className="max-w-6xl mx-auto mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Product Compliance — Demo</h1>
        <div className="space-x-2">
          <button onClick={() => setView('seller')} className={`px-4 py-2 rounded ${view==='seller'?'bg-blue-600 text-white':'bg-white border'}`}>Seller View</button>
          <button onClick={() => setView('backend')} className={`px-4 py-2 rounded ${view==='backend'?'bg-blue-600 text-white':'bg-white border'}`}>Compliance Panel</button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Left column: form or filters */}
        <section className="col-span-1 md:col-span-1">
          {view === 'seller' ? (
            <div className="bg-white rounded-xl shadow-lg p-6">
              <div className="bg-gradient-to-r from-blue-50 to-purple-50 p-4 rounded-lg mb-6 border border-blue-100">
                <h2 className="text-lg font-semibold text-gray-800 mb-2">📊 Compliance Checker</h2>
                <p className="text-sm text-gray-600">
                  Verify Legal Metrology requirements for your products. Upload images or paste URLs from any shopping site.
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="bg-gray-50 p-4 rounded-lg border-2 border-dashed border-gray-200 hover:border-purple-300 transition-colors">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    📷 Product Image
                  </label>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-purple-50 file:text-purple-700 hover:file:bg-purple-100"
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

                <div className="bg-gray-50 p-4 rounded-lg border-2 border-dashed border-gray-200 hover:border-purple-300 transition-colors">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    🔗 Product URL
                  </label>
                  <input
                    name="url"
                    type="text"
                    placeholder="https://amazon.in | flipkart.com | myntra.com"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm"
                  />
                  <p className="text-xs text-gray-500 mt-1">Any e-commerce website URL</p>
                </div>

                <div className="flex space-x-3">
                  <button
                    type="submit"
                    disabled={submitting}
                    className="flex-1 bg-gradient-to-r from-purple-600 to-blue-600 text-white py-3 px-4 rounded-lg font-medium hover:from-purple-700 hover:to-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 transform hover:scale-105"
                  >
                    {submitting ? (
                      <div className="flex items-center justify-center">
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                        Checking...
                      </div>
                    ) : (
                      '✨ Check'
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => { 
                      if (fileInputRef.current) fileInputRef.current.value = null; 
                      setResult(null);
                    }}
                    className="px-4 py-3 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    Clear
                  </button>
                </div>
              </form>

              {/* Quick status summary in sidebar */}
              {result && (
                <div className="mt-6 pt-6 border-t border-gray-200">
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
                  <div className="bg-white rounded-xl shadow-lg p-6 border-l-4 border-purple-500">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center space-x-3">
                        <div className={`w-12 h-12 rounded-full flex items-center justify-center text-white text-xl font-bold ${
                          result.status === 'approved' ? 'bg-green-500' : 
                          result.status === 'failed' ? 'bg-yellow-500' : 'bg-red-500'
                        }`}>
                          {result.status === 'approved' ? '✓' : result.status === 'failed' ? '⚠' : '✗'}
                        </div>
                        <div>
                          <h3 className="text-xl font-bold text-gray-800">
                            {result.status === 'approved' ? 'Compliant' : 
                             result.status === 'failed' ? 'Needs Review' : 'Non-Compliant'}
                          </h3>
                          <p className="text-gray-600">Compliance Score: {result.compliance_score}%</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-3xl font-bold text-purple-600">{result.compliance_score}%</div>
                        <div className="text-sm text-gray-500">Legal Metrology</div>
                      </div>
                    </div>
                  </div>

                  {/* Product Information Card */}
                  <div className="bg-white rounded-xl shadow-lg overflow-hidden">
                    <div className="bg-gradient-to-r from-blue-50 to-purple-50 px-6 py-4 border-b">
                      <h4 className="text-lg font-semibold text-gray-800">📦 Product Information</h4>
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
                      <div className="bg-red-50 px-6 py-4 border-b border-red-100">
                        <h4 className="text-lg font-semibold text-red-800">⚠️ Issues Found</h4>
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
                  <div className="w-24 h-24 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <span className="text-gray-400 text-3xl">📊</span>
                  </div>
                  <h3 className="text-xl font-semibold text-gray-800 mb-2">Ready to Check Compliance</h3>
                  <p className="text-gray-600">Upload a product image or paste an e-commerce URL to start the compliance analysis.</p>
                </div>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-white p-4 rounded shadow">
                <h3 className="font-semibold mb-3">Compliance Trend</h3>
                {trendData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={200}>
                    <LineChart data={trendData}>
                      <XAxis dataKey="x" />
                      <YAxis />
                      <Tooltip />
                      <CartesianGrid strokeDasharray="3 3" />
                      <Line type="monotone" dataKey="compliance" stroke="#2563eb" strokeWidth={2} />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="text-sm text-gray-600">No data yet.</div>
                )}
              </div>

              <div className="bg-white p-4 rounded shadow">
                <h3 className="font-semibold mb-3">Violations by Brand</h3>
                {brandViolations.some(b => b.violations > 0) ? (
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={brandViolations}>
                      <XAxis dataKey="brand" />
                      <YAxis />
                      <Tooltip />
                      <CartesianGrid strokeDasharray="3 3" />
                      <Bar dataKey="violations" fill="#ef4444" />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="text-sm text-gray-600">No violations yet.</div>
                )}
              </div>
            </div>
          )}

          {/* Bottom: submission logs */}
          <div className="bg-white p-4 rounded shadow mt-6">
            <h3 className="font-semibold mb-3">Recent Submissions ({logs.length})</h3>
            {logs.length > 0 ? (
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {logs.map((log) => (
                  <div key={log.id} className={`p-3 rounded border ${log.highlight ? 'border-red-200 bg-red-50' : 'border-gray-200'}`}>
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium">{log.product_preview}</span>
                      <span className={`px-2 py-1 rounded text-xs ${statusColor(log.status)}`}>{log.status}</span>
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      {new Date(log.timestamp).toLocaleString()} • Score: {log.compliance_score}%
                      {log.violations?.length > 0 && ` • ${log.violations.length} violation(s)`}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-sm text-gray-600">No submissions yet.</div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
