const test = require('node:test');
const assert = require('node:assert/strict');
const { isBlockedAddress, validateUrl } = require('../url-safety');

test('blocks non-public IPv4 ranges', () => {
  for (const ip of [
    '0.0.0.0', '10.1.2.3', '100.64.0.1', '127.0.0.1', '169.254.169.254',
    '172.16.0.1', '172.31.255.255', '192.168.1.1', '192.0.0.8', '198.18.0.1',
    '224.0.0.1', '255.255.255.255'
  ]) {
    assert.equal(isBlockedAddress(ip), true, ip);
  }
});

test('allows public IPv4 addresses', () => {
  for (const ip of ['8.8.8.8', '1.1.1.1', '172.32.0.1', '100.128.0.1', '93.184.216.34']) {
    assert.equal(isBlockedAddress(ip), false, ip);
  }
});

test('blocks non-public and IPv4-mapped IPv6 addresses', () => {
  for (const ip of [
    '::', '::1', 'fc00::1', 'fd12:3456::1', 'fe80::1', 'ff02::1',
    '::ffff:127.0.0.1', '::ffff:7f00:1', '::ffff:a9fe:a9fe'
  ]) {
    assert.equal(isBlockedAddress(ip), true, ip);
  }
});

test('allows public IPv6 addresses', () => {
  for (const ip of ['2606:4700:4700::1111', '2001:4860:4860::8888', '::ffff:8.8.8.8']) {
    assert.equal(isBlockedAddress(ip), false, ip);
  }
});

test('treats non-IP strings as blocked', () => {
  assert.equal(isBlockedAddress('example.com'), true);
});

test('validateUrl rejects internal targets without network access', async () => {
  for (const url of [
    'http://127.0.0.1/',
    'http://0.0.0.0:8000/health',
    'http://[::1]/',
    'http://[::ffff:127.0.0.1]/',
    'http://169.254.169.254/latest/meta-data/',
    'http://localhost:8000/',
    'http://foo.localhost/',
    'http://printer.local/',
    'http://metadata.google.internal/'
  ]) {
    await assert.rejects(validateUrl(url), /URL validation failed/, url);
  }
});

test('validateUrl rejects non-HTTP protocols', async () => {
  for (const url of ['file:///etc/passwd', 'ftp://example.com/', 'gopher://example.com/']) {
    await assert.rejects(validateUrl(url), /Only HTTP and HTTPS/, url);
  }
});

test('validateUrl accepts public IP literals', async () => {
  assert.equal(await validateUrl('https://93.184.216.34/'), true);
});
