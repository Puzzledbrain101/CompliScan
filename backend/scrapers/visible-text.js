// visible-text.js - turn a product page into "Label: value" lines and run the
// same declaration extractor used for OCR text. Indian e-commerce rules require
// listings to show these declarations, usually in a specs table or list.
const { extractFieldsFromText } = require('../ocr-processor');
const { DECLARATION_LABEL } = require('./labels');

const MAX_TEXT_CHARS = 400000;
const BLOCK_TAGS = 'address,article,aside,blockquote,dd,div,dl,dt,figcaption,footer,h1,h2,h3,h4,h5,h6,header,li,main,nav,ol,p,section,table,tbody,td,th,thead,tr,ul';

// Options for web text: only labelled values, one-line addresses
const WEB_OPTIONS = { labeledOnly: true, continuationLines: 0 };

const collapse = (text) => text.replace(/\s+/g, ' ').trim();

function pageLines($) {
  $('script,style,noscript,svg,template,iframe,head').remove();

  // Table rows and definition lists become "label: value"
  $('tr').each((_, tr) => {
    const cells = $(tr).children('th,td').map((__, c) => collapse($(c).text())).get().filter(Boolean);
    const line = cells.length >= 2 ? `${cells[0]}: ${cells.slice(1).join(' ')}` : cells.join(' ');
    $(tr).replaceWith($('<div>').text(line));
  });
  $('dt').each((_, dt) => {
    const dd = $(dt).next('dd');
    $(dt).replaceWith($('<div>').text(`${collapse($(dt).text())}: ${collapse(dd.text())}`));
    dd.remove();
  });

  $('br').replaceWith('\n');
  $(BLOCK_TAGS).each((_, el) => {
    $(el).prepend('\n');
    $(el).append('\n');
  });

  const lines = $.root().text().slice(0, MAX_TEXT_CHARS).split('\n').map(collapse).filter(Boolean);

  // Join "Country of Origin" + "India" split across elements
  const joined = [];
  for (let i = 0; i < lines.length; i++) {
    if (DECLARATION_LABEL.test(lines[i]) && lines[i + 1] && !DECLARATION_LABEL.test(lines[i + 1]) && lines[i + 1].length <= 300) {
      joined.push(`${lines[i].replace(/[:\-]\s*$/, '')}: ${lines[i + 1]}`);
      i++;
    } else {
      joined.push(lines[i]);
    }
  }
  return joined;
}

// Extract labelled declarations from "Label: value" lines
function extractFromLines(lines) {
  return extractFieldsFromText(lines.join('\n'), WEB_OPTIONS).fields;
}

// Note: mutates $, so pass a dedicated cheerio instance
function extractVisibleText($) {
  return extractFromLines(pageLines($));
}

module.exports = { extractVisibleText, extractFromLines, pageLines };
