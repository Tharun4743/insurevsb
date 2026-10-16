'use strict';

/**
 * Vercel Serverless Function entry point for the INSURE Express API.
 * Dispatches all /api/* and /health incoming requests to the pre-compiled Express application.
 */
const app = require('../backend/dist/server');

module.exports = (req, res) => {
  // If the incoming request URL was rewritten without the /api prefix,
  // normalize it so that Express route handlers match properly.
  if (req.url && !req.url.startsWith('/api') && !req.url.startsWith('/health')) {
    req.url = '/api' + (req.url.startsWith('/') ? req.url : '/' + req.url);
  }
  return app(req, res);
};
