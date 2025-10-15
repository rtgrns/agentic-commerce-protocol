// Middleware for Agentic Commerce Protocol - Header validation and request processing
const crypto = require("crypto");

/**
 * Validates required headers for Agentic Commerce Protocol requests
 */
function validateHeaders(req, res, next) {
  const errors = [];

  // Required headers
  const apiVersion = req.headers["api-version"];
  const contentType = req.headers["content-type"];
  const authorization = req.headers["authorization"];

  // API Version validation
  if (!apiVersion) {
    errors.push("Missing required header: API-Version");
  } else {
    const supportedVersions = (
      process.env.SUPPORTED_API_VERSIONS || "2025-09-12"
    ).split(",");
    if (!supportedVersions.includes(apiVersion)) {
      return res.status(400).json({
        type: "invalid_request",
        code: "unsupported_api_version",
        message: `API version ${apiVersion} is not supported. Supported versions: ${supportedVersions.join(", ")}`,
      });
    }
    req.apiVersion = apiVersion;
  }

  // Content-Type validation (for POST/PUT/PATCH)
  if (["POST", "PUT", "PATCH"].includes(req.method)) {
    if (!contentType || !contentType.includes("application/json")) {
      errors.push("Content-Type must be application/json");
    }
  }

  // Authorization validation (optional in POC, but log if missing)
  if (!authorization) {
    console.warn("⚠️  Missing Authorization header");
  } else {
    // Extract token (Bearer scheme)
    const match = authorization.match(/^Bearer\s+(.+)$/i);
    if (match) {
      req.authToken = match[1];
    }
  }

  if (errors.length > 0) {
    return res.status(400).json({
      type: "invalid_request",
      code: "missing_required_headers",
      message: errors.join(", "),
    });
  }

  next();
}

/**
 * Handles idempotency for safe request retries
 */
const idempotencyStore = new Map(); // In-memory store for POC (use Redis in production)

function handleIdempotency(req, res, next) {
  const idempotencyKey = req.headers["idempotency-key"];

  if (!idempotencyKey) {
    // Idempotency is recommended but not required
    return next();
  }

  req.idempotencyKey = idempotencyKey;

  // Check if we've seen this key before
  if (idempotencyStore.has(idempotencyKey)) {
    const cached = idempotencyStore.get(idempotencyKey);

    // Compare request body to detect conflicts
    const currentBodyHash = hashRequestBody(req.body);
    if (cached.bodyHash !== currentBodyHash) {
      return res.status(409).json({
        type: "invalid_request",
        code: "idempotency_conflict",
        message: "Same Idempotency-Key used with different parameters",
      });
    }

    // Return cached response
    console.log(`♻️  Idempotent request detected: ${idempotencyKey}`);
    return res.status(cached.status).json(cached.response);
  }

  // Store original res.json for interception
  const originalJson = res.json.bind(res);
  res.json = function (data) {
    // Cache the response
    if (req.idempotencyKey && res.statusCode < 500) {
      idempotencyStore.set(req.idempotencyKey, {
        status: res.statusCode,
        response: data,
        bodyHash: hashRequestBody(req.body),
        timestamp: Date.now(),
      });

      // Clean up old entries after 24 hours
      setTimeout(
        () => {
          idempotencyStore.delete(req.idempotencyKey);
        },
        24 * 60 * 60 * 1000
      );
    }
    return originalJson(data);
  };

  next();
}

/**
 * Adds request correlation headers
 */
function addCorrelationHeaders(req, res, next) {
  const requestId =
    req.headers["request-id"] ||
    `req_${crypto.randomBytes(16).toString("hex")}`;
  req.requestId = requestId;

  // Add response headers
  res.setHeader("Request-Id", requestId);

  if (req.idempotencyKey) {
    res.setHeader("Idempotency-Key", req.idempotencyKey);
  }

  next();
}

/**
 * Logs request information
 */
function logRequest(req, res, next) {
  const timestamp = new Date().toISOString();
  console.log(
    `[${timestamp}] ${req.method} ${req.path} | Request-Id: ${req.requestId}`
  );

  if (req.idempotencyKey) {
    console.log(`  Idempotency-Key: ${req.idempotencyKey}`);
  }

  next();
}

/**
 * Verifies request signature (optional but recommended)
 */
function verifySignature(req, res, next) {
  const signature = req.headers["signature"];
  const timestamp = req.headers["timestamp"];

  if (!signature || !timestamp) {
    // Signature verification is optional in POC
    return next();
  }

  // In production, verify the signature using the configured algorithm
  // For now, just validate timestamp freshness
  const requestTime = new Date(timestamp);
  const now = new Date();
  const diff = Math.abs(now - requestTime);

  // Reject requests older than 5 minutes
  if (diff > 5 * 60 * 1000) {
    return res.status(400).json({
      type: "invalid_request",
      code: "invalid_timestamp",
      message: "Request timestamp is outside acceptable window",
    });
  }

  req.timestamp = timestamp;
  next();
}

/**
 * Helper function to hash request body for idempotency comparison
 */
function hashRequestBody(body) {
  if (!body) return "";
  const bodyString = JSON.stringify(body);
  return crypto.createHash("sha256").update(bodyString).digest("hex");
}

/**
 * Combined middleware stack for Agentic Commerce endpoints
 */
function agenticCommerceMiddleware() {
  return [
    addCorrelationHeaders,
    validateHeaders,
    verifySignature,
    handleIdempotency,
    logRequest,
  ];
}

module.exports = {
  validateHeaders,
  handleIdempotency,
  addCorrelationHeaders,
  logRequest,
  verifySignature,
  agenticCommerceMiddleware,
};
