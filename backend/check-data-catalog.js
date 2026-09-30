// Fails when a table that holds an accountId has neither a DATA_CATALOG entry nor a CATALOG_EXEMPT listing.
// Run from the backend folder: node check-data-catalog.js   (uses a throwaway local SQLite file)
process.env.CXMEDIA_TEST_DB_PATH = require('path').join(require('os').tmpdir(), 'catalog-check-' + process.pid + '.db');
delete process.env.DATABASE_URL;
const handler = require('./server.js');
setTimeout(() => {
  const gap = handler.catalogCoverage();
  if (gap && gap.length) { console.error('Tables missing from the data catalog: ' + gap.join(', ')); process.exit(1); }
  console.log('Data catalog covers every account table.'); process.exit(0);
}, 4000);
