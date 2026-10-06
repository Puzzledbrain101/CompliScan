// url-safety.js - SSRF protection for outbound product page fetches
const dns = require('dns');
const net = require('net');

// True for loopback, private, link-local, CGNAT, multicast and other
// non-public addresses (IPv4, IPv6, and IPv4-mapped IPv6)
function isBlockedAddress(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) ||  // CGNAT
      (a === 169 && b === 254) ||            // link-local / cloud metadata
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 192 && b === 0) ||
      (a === 198 && (b === 18 || b === 19));
  }
  if (net.isIPv6(ip)) {
    const addr = ip.toLowerCase();
    const mapped = addr.match(/^::ffff:(?:0:)?(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isBlockedAddress(mapped[1]);
    const mappedHex = addr.match(/^::ffff:(?:0:)?([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
    if (mappedHex) {
      const hi = parseInt(mappedHex[1], 16);
      const lo = parseInt(mappedHex[2], 16);
      return isBlockedAddress(`${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`);
    }
    return addr === '::' || addr === '::1' ||
      /^f[cd]/.test(addr) ||       // unique local fc00::/7
      /^fe[89ab]/.test(addr) ||    // link-local fe80::/10
      /^ff/.test(addr);            // multicast
  }
  return true; // not an IP at all
}

// dns.lookup replacement used for outbound requests: re-checks the address
// actually being connected to, so DNS rebinding cannot reach internal hosts
function safeLookup(hostname, options, callback) {
  dns.lookup(hostname, options, (err, address, family) => {
    if (err) return callback(err);
    const addresses = Array.isArray(address) ? address.map(a => a.address) : [address];
    if (addresses.some(isBlockedAddress)) {
      return callback(new Error('URL validation failed: domain resolves to a private IP address'));
    }
    callback(null, address, family);
  });
}

// Validate a URL before fetching it to prevent SSRF
async function validateUrl(url) {
  try {
    const parsedUrl = new URL(url);

    // Only allow http and https protocols
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      throw new Error('Only HTTP and HTTPS protocols are allowed');
    }

    // URL hostnames keep brackets around IPv6 literals
    const hostname = parsedUrl.hostname.toLowerCase().replace(/^\[|\]$/g, '');

    if (net.isIP(hostname)) {
      if (isBlockedAddress(hostname)) {
        throw new Error('Access to private IP ranges is not allowed');
      }
      return true;
    }

    if (hostname === 'localhost' || /\.(localhost|local|internal)$/.test(hostname)) {
      throw new Error('Access to internal hostnames is not allowed');
    }

    let addresses;
    try {
      addresses = await dns.promises.lookup(hostname, { all: true });
    } catch (dnsError) {
      throw new Error(`Could not resolve host ${hostname}`);
    }
    if (addresses.some(a => isBlockedAddress(a.address))) {
      throw new Error('Domain resolves to private IP address');
    }

    return true;
  } catch (error) {
    throw new Error(`URL validation failed: ${error.message}`);
  }
}

module.exports = {
  isBlockedAddress,
  safeLookup,
  validateUrl
};
