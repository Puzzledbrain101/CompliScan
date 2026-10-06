// labels.js - text that names a Legal Metrology declaration (not its value),
// e.g. "Country of Origin", "Name and address of the Packer", "MRP:"
const DECLARATION_LABEL = new RegExp(
  '^(' + [
    'country\\s*of\\s*origin', 'made\\s*in', 'origin',
    '(name\\s*(and|&)\\s*address\\s*of\\s*(the\\s*)?)?(manufacturer|packer|importer|marketer)(\\s*(name|details|address|info))?',
    'manufactured\\s*(&|and)?\\s*(marketed\\s*)?by', 'marketed\\s*by', 'packed\\s*by', 'imported\\s*by',
    'net\\s*(quantity|qty|weight|wt|content|contents|volume)',
    'm\\.?\\s*r\\.?\\s*p\\.?', 'maximum\\s*retail\\s*price',
    '(customer|consumer)\\s*care(\\s*(details|address|number|email))?',
    'date\\s*of\\s*(manufacture|mfg|packing|import)', 'mfg\\.?\\s*date',
    'month\\s*(and|&)\\s*year\\s*of\\s*(manufacture|mfg|packing|import)'
  ].join('|') + ')\\s*[:\\-]?$',
  'i'
);

module.exports = { DECLARATION_LABEL };
