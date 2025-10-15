# Bun Migration Plan - ACP POC

## Overview
This document provides a step-by-step migration plan to convert the Agentic Commerce Protocol POC from Node.js to Bun runtime.

**Current State:**
- Node.js v20.19.3
- Bun v1.1.3 (needs update)
- Express-based REST API
- CommonJS modules
- Dependencies: express, stripe, dotenv, cors, body-parser, uuid

**Target State:**
- Latest Bun version
- Same functionality with improved performance
- Optimized for Bun's capabilities

---

## Prerequisites

- macOS system with Bun installed
- Current working directory: `/Users/RNietoSalgado/DEV/POCs/agentic-commerce-protocol/rtgPOC`
- Admin/sudo access for Bun updates
- Basic familiarity with command line

---

## Migration Steps

### Step 1: Verify and Update Bun Installation
**Estimated Time:** 2-3 minutes

```bash
# Check current Bun version
bun --version

# Update Bun to latest version
curl -fsSL https://bun.sh/install | bash

# Reload shell or run:
source ~/.zshrc

# Verify latest version installed
bun --version
```

**Expected Outcome:** Bun updated to latest stable version (1.1.42+)

---

### Step 2: Backup Current Project
**Estimated Time:** 1 minute

```bash
# Create backup directory
mkdir -p ../backups

# Create timestamped backup
cp -r . "../backups/rtgPOC-backup-$(date +%Y%m%d-%H%M%S)"

# Verify backup created
ls -la ../backups/
```

**Expected Outcome:** Complete backup of current project state

---

### Step 3: Clean Node.js Artifacts
**Estimated Time:** 1 minute

```bash
# Remove Node.js specific files
rm -rf node_modules
rm -f package-lock.json
rm -f yarn.lock

# Verify cleanup
ls -la
```

**Expected Outcome:** Clean project directory without Node.js artifacts

---

### Step 4: Install Dependencies with Bun
**Estimated Time:** 30 seconds - 1 minute

```bash
# Install all dependencies using Bun
bun install

# Verify installation
ls -la node_modules/
cat bun.lockb > /dev/null && echo "Lock file created successfully"
```

**Expected Outcome:** 
- All dependencies installed via Bun
- `bun.lockb` file generated
- Significantly faster installation than npm

---

### Step 5: Update Package.json Scripts
**Estimated Time:** 2 minutes

Edit `package.json` and update the scripts section:

```json
{
  "scripts": {
    "start": "bun run server.js",
    "dev": "bun --watch server.js",
    "test": "bun test"
  }
}
```

**Manual Steps:**
1. Open `package.json` in editor
2. Replace scripts section with the above
3. Save file

**Expected Outcome:** Scripts configured to use Bun runtime with watch mode for development

---

### Step 6: Test Application Functionality
**Estimated Time:** 3-5 minutes

```bash
# Start the server
bun run dev

# In another terminal, test endpoints:

# Health check
curl http://localhost:3000/health

# Product feed
curl http://localhost:3000/api/products/feed

# Specific product
curl http://localhost:3000/api/products/LAPTOP001

# Search
curl "http://localhost:3000/api/products/search?q=laptop"

# Stop server with Ctrl+C
```

**Expected Outcome:** All endpoints respond correctly, server starts faster than before

---

### Step 7: Optional Code Optimizations
**Estimated Time:** 5-10 minutes

#### 7.1 Remove body-parser (optional)
Edit `server.js`:

```javascript
// Remove this line:
// const bodyParser = require('body-parser');

// Replace these lines:
// app.use(bodyParser.json());
// app.use(bodyParser.urlencoded({ extended: true }));

// With:
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
```

#### 7.2 Optimize dotenv usage (optional)
Since Bun has native .env support, you can optionally remove dotenv:

```bash
# Remove dotenv dependency
bun remove dotenv
```

Edit `server.js`:
```javascript
// Remove this line:
// require('dotenv').config();
```

**Expected Outcome:** Cleaner dependencies, leveraging Bun's built-in features

---

### Step 8: Final Verification and Documentation
**Estimated Time:** 3-5 minutes

```bash
# Final functionality test
bun run start

# Check startup time and memory usage
time bun run server.js &
sleep 2
ps aux | grep bun

# Test complete flow with a sample checkout (if test data exists)
curl -X POST http://localhost:3000/api/checkout/initiate \
  -H "Content-Type: application/json" \
  -d '{
    "product_id": "LAPTOP001",
    "quantity": 1,
    "buyer_info": {
      "name": "Test User",
      "email": "test@example.com"
    }
  }'
```

**Expected Outcome:** 
- Server starts significantly faster
- All functionality works identically
- Lower memory footprint

---

## Rollback Plan

If issues arise, restore from backup:

```bash
# Stop current server
pkill -f "bun.*server.js"

# Restore backup
cd ..
rm -rf rtgPOC
cp -r backups/rtgPOC-backup-[TIMESTAMP] rtgPOC
cd rtgPOC

# Install with npm
npm install

# Start with Node.js
npm run dev
```

---

## Success Criteria

✅ **Migration Successful When:**
- [ ] Bun updated to latest version
- [ ] All dependencies installed with `bun install`
- [ ] Server starts with `bun run dev`
- [ ] All API endpoints respond correctly
- [ ] Health check returns 200 status
- [ ] Product feed returns product list
- [ ] Checkout flow works end-to-end
- [ ] Performance improved (faster startup)

---

## Performance Expectations

**Expected Improvements:**
- **Startup Time:** 50-70% faster
- **Memory Usage:** 20-30% reduction  
- **Install Time:** 2-3x faster than npm
- **Runtime Performance:** 10-20% improvement

---

## Troubleshooting

**Common Issues:**

1. **Permission errors during Bun update:**
   ```bash
   sudo chown -R $(whoami) ~/.bun
   ```

2. **Port already in use:**
   ```bash
   lsof -ti:3000 | xargs kill -9
   ```

3. **Missing .env file:**
   ```bash
   # Ensure .env file exists with required variables
   ls -la .env
   ```

4. **Stripe key issues:**
   - Verify `STRIPE_SECRET_KEY` in `.env`
   - Check Stripe dashboard for test keys

---

## Post-Migration Tasks

1. Update any deployment scripts to use Bun
2. Update CI/CD pipelines if applicable
3. Document the migration in project README
4. Consider migrating to ES modules for future optimization
5. Explore Bun's testing framework for test files

---

## Estimated Total Migration Time

**Total Duration:** 15-25 minutes
- Active work: 10-15 minutes
- Testing/verification: 5-10 minutes

**Difficulty Level:** Low
**Risk Level:** Very Low (easy rollback available)