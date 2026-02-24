/**
 * CI command - Generate CI/CD configuration files
 * @license GPL-3.0-or-later
 */

import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { resolve, join } from 'path';
import chalk from 'chalk';

/**
 * CI/CD templates for various providers
 */
const CI_TEMPLATES = {
  github: {
    name: 'GitHub Actions',
    description: 'GitHub Actions workflow for testing and deployment',
    files: {
      '.github/workflows/ci.yml': `name: CI/CD

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '18'
          cache: 'npm'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Run linter
        run: npm run lint --if-present
      
      - name: Build application
        run: npm run build
      
      - name: Run tests
        run: npm test --if-present
      
      - name: Upload artifacts
        uses: actions/upload-artifact@v3
        with:
          name: build
          path: dist/
          retention-days: 30
  
  deploy:
    needs: test
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    
    steps:
      - uses: actions/checkout@v4
      
      - name: Deploy to Cloudflare Pages
        uses: cloudflare/wrangler-action@v3
        with:
          apiToken: \${{ secrets.CLOUDFLARE_API_TOKEN }}
          accountId: \${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
          command: pages deploy dist --project-name=\${{ vars.CLOUDFLARE_PAGES_PROJECT }}
`,
    },
  },
  
  gitlab: {
    name: 'GitLab CI/CD',
    description: 'GitLab CI/CD pipeline for testing and deployment',
    files: {
      '.gitlab-ci.yml': `image: node:18

stages:
  - build
  - test
  - deploy

cache:
  paths:
    - node_modules/

before_script:
  - npm ci

build:
  stage: build
  script:
    - npm run build
  artifacts:
    paths:
      - dist/
    expire_in: 1 week

test:
  stage: test
  script:
    - npm run lint
    - npm test
  coverage: '/All files[^|]*\\|[^|]*\\s+([\\d\\.]+)/'

deploy_production:
  stage: deploy
  script:
    - npm run build
    - echo "Deploy to production server"
  only:
    - main
  when: manual
`,
    },
  },
  
  netlify: {
    name: 'Netlify',
    description: 'Netlify deployment configuration',
    files: {
      'netlify.toml': `[build]
  command = "npm run build"
  publish = "dist"
  
[build.environment]
  NODE_VERSION = "18"

# Cross-origin isolation headers (required for WASM SharedArrayBuffer)
[[headers]]
  for = "/*"
  [headers.values]
    Cross-Origin-Opener-Policy = "same-origin"
    Cross-Origin-Embedder-Policy = "require-corp"
    Cross-Origin-Resource-Policy = "cross-origin"
    X-Content-Type-Options = "nosniff"
    X-Frame-Options = "SAMEORIGIN"
    Referrer-Policy = "strict-origin-when-cross-origin"

[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200
`,
    },
  },
  
  docker: {
    name: 'Docker',
    description: 'Docker containerization for deployment',
    files: {
      'Dockerfile': `# Build stage
FROM node:18-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy source files
COPY . .

# Build application
RUN npm run build

# Production stage
FROM nginx:alpine

# Copy built files
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Expose port
EXPOSE 80

# Start nginx
CMD ["nginx", "-g", "daemon off;"]
`,
      'nginx.conf': `server {
  listen 80;
  server_name _;
  
  root /usr/share/nginx/html;
  index index.html;
  
  # Gzip compression
  gzip on;
  gzip_types text/plain text/css application/json application/javascript text/xml application/xml text/javascript;
  
  # Security headers
  add_header X-Content-Type-Options "nosniff" always;
  add_header X-Frame-Options "DENY" always;
  add_header X-XSS-Protection "1; mode=block" always;
  add_header Referrer-Policy "strict-origin-when-cross-origin" always;
  
  # WASM headers
  location /wasm/ {
    add_header Cross-Origin-Opener-Policy "same-origin";
    add_header Cross-Origin-Embedder-Policy "require-corp";
  }
  
  # SPA routing
  location / {
    try_files $uri $uri/ /index.html;
  }
  
  # Cache static assets
  location ~* \\.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
    expires 1y;
    add_header Cache-Control "public, immutable";
  }
}
`,
      'docker-compose.yml': `version: '3.8'

services:
  web:
    build: .
    ports:
      - "8080:80"
    restart: unless-stopped
    environment:
      - NODE_ENV=production
`,
      '.dockerignore': `node_modules
npm-debug.log
dist
.git
.gitignore
README.md
.env
.env.local
.DS_Store
`,
    },
  },
  
  cloudflare: {
    name: 'Cloudflare Pages',
    description: 'Cloudflare Pages deployment configuration (recommended)',
    files: {
      'public/_headers': `# Cloudflare Pages Headers Configuration
# Required for OpenSCAD WASM SharedArrayBuffer support

# Apply cross-origin isolation headers to all routes
/*
  Cross-Origin-Opener-Policy: same-origin
  Cross-Origin-Embedder-Policy: require-corp
  Cross-Origin-Resource-Policy: cross-origin

# Security headers
/*
  X-Content-Type-Options: nosniff
  X-Frame-Options: SAMEORIGIN
  Referrer-Policy: strict-origin-when-cross-origin

# Cache static assets aggressively
/assets/*
  Cache-Control: public, max-age=31536000, immutable

# Cache WASM files
/*.wasm
  Cache-Control: public, max-age=31536000, immutable
  Content-Type: application/wasm

# Don't cache HTML (always fresh)
/*.html
  Cache-Control: no-cache, no-store, must-revalidate

/
  Cache-Control: no-cache, no-store, must-revalidate
`,
      'public/_redirects': `# Cloudflare Pages Redirects Configuration
# SPA fallback - all routes serve index.html

/*    /index.html   200
`,
      '.github/workflows/cloudflare-pages.yml': `name: Deploy to Cloudflare Pages

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      deployments: write
    
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Build
        run: npm run build
      
      - name: Deploy to Cloudflare Pages
        uses: cloudflare/wrangler-action@v3
        with:
          apiToken: \${{ secrets.CLOUDFLARE_API_TOKEN }}
          accountId: \${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
          command: pages deploy dist --project-name=openscad-customizer
`,
    },
  },
  
  validation: {
    name: 'Validation Pipeline',
    description: 'Golden fixtures and automated testing',
    files: {
      'tests/golden-fixtures.json': `{
  "fixtures": [
    {
      "name": "simple-box-default",
      "description": "Simple box with default parameters",
      "parameters": {
        "width": 100,
        "height": 50,
        "depth": 75
      },
      "expected": {
        "vertices": 8,
        "faces": 12,
        "bounds": {
          "min": [0, 0, 0],
          "max": [100, 50, 75]
        }
      }
    },
    {
      "name": "cylinder-custom",
      "description": "Cylinder with custom dimensions",
      "parameters": {
        "radius": 25,
        "height": 100,
        "resolution": 32
      },
      "expected": {
        "vertices": 64,
        "faces": 62
      }
    }
  ],
  "tolerance": {
    "vertex": 0.001,
    "face": 0,
    "bounds": 0.01
  },
  "timeout": 60000
}
`,
      'tests/run-golden-tests.js': `/**
 * Golden fixture test runner
 * @license GPL-3.0-or-later
 */

import { readFileSync } from 'fs';
import { execSync } from 'child_process';

// Load fixtures
const fixtures = JSON.parse(readFileSync('./tests/golden-fixtures.json', 'utf-8'));

console.log('🧪 Running Golden Fixture Tests\\n');

let passed = 0;
let failed = 0;

for (const fixture of fixtures.fixtures) {
  process.stdout.write('Testing: ' + fixture.name + '... ');
  
  try {
    // Run validation command
    const result = execSync(
      'openscad-forge validate ./webapp --format json',
      { encoding: 'utf-8', timeout: fixtures.timeout }
    );
    
    const validation = JSON.parse(result);
    
    // Check results
    if (validation.passed) {
      console.log('✓ PASS');
      passed++;
    } else {
      console.log('✗ FAIL');
      console.log('  ' + validation.error);
      failed++;
    }
  } catch (err) {
    console.log('✗ ERROR');
    console.log('  ' + err.message);
    failed++;
  }
}

console.log('\nResults: ' + passed + ' passed, ' + failed + ' failed');
process.exit(failed > 0 ? 1 : 0);
`,
    },
  },
};

/**
 * CI command handler
 * @param {Object} options - Command options
 */
export async function ciCommand(options) {
  try {
    console.log(chalk.blue('⚙️  OpenSCAD Forge - CI/CD Generator'));
    
    // List providers if requested
    if (options.list) {
      console.log(chalk.blue('\\n📋 Available CI/CD Providers:\\n'));
      for (const [key, template] of Object.entries(CI_TEMPLATES)) {
        console.log(chalk.bold(key));
        console.log(chalk.gray(`  ${template.description}`));
        console.log(chalk.gray(`  Files: ${Object.keys(template.files).join(', ')}`));
        console.log();
      }
      return;
    }
    
    if (!options.provider) {
      console.error(chalk.red('✗ Provider required'));
      console.log(chalk.yellow('Use --provider <name> or --list to see options'));
      process.exit(1);
    }
    
    const template = CI_TEMPLATES[options.provider];
    if (!template) {
      console.error(chalk.red(`✗ Unknown provider: ${options.provider}`));
      console.log(chalk.yellow('Use --list to see available providers'));
      process.exit(1);
    }
    
    console.log(chalk.green(`✓ Using provider: ${template.name}`));
    
    const outDir = resolve(options.out);
    console.log(chalk.gray(`Output: ${outDir}`));
    
    let filesCreated = 0;
    for (const [filePath, content] of Object.entries(template.files)) {
      const fullPath = join(outDir, filePath);
      const fileDir = fullPath.substring(0, fullPath.lastIndexOf('/') || fullPath.lastIndexOf('\\\\'));

      if (!existsSync(fileDir)) {
        mkdirSync(fileDir, { recursive: true });
      }

      if (existsSync(fullPath)) {
        console.log(chalk.yellow(`⚠ Skipped (exists): ${filePath}`));
        continue;
      }

      writeFileSync(fullPath, content, 'utf-8');
      console.log(chalk.green(`✓ Created: ${filePath}`));
      filesCreated++;
    }
    
    console.log(chalk.blue(`\n📋 Summary: ${filesCreated} file(s) created`));
    
    // Provider-specific instructions
    if (options.provider === 'github') {
      console.log(chalk.blue('\\n🚀 Next Steps:'));
      console.log(chalk.gray('1. Add secrets to GitHub repository:'));
      console.log(chalk.gray('   - CLOUDFLARE_API_TOKEN'));
      console.log(chalk.gray('   - CLOUDFLARE_ACCOUNT_ID'));
      console.log(chalk.gray('2. Add repo variable: CLOUDFLARE_PAGES_PROJECT (your Pages project name)'));
      console.log(chalk.gray('3. Push to GitHub to trigger workflow'));
    } else if (options.provider === 'cloudflare') {
      console.log(chalk.blue('\\n🚀 Next Steps:'));
      console.log(chalk.gray('1. Create Cloudflare account at https://dash.cloudflare.com'));
      console.log(chalk.gray('2. Install Wrangler CLI: npm i -g wrangler'));
      console.log(chalk.gray('3. Login: wrangler login'));
      console.log(chalk.gray('4. Create project: wrangler pages project create <name>'));
      console.log(chalk.gray('5. Build: npm run build'));
      console.log(chalk.gray('6. Deploy: wrangler pages deploy dist --project-name=<name>'));
      console.log(chalk.gray('\\nFor GitHub Actions:'));
      console.log(chalk.gray('  Add secrets: CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID'));
    } else if (options.provider === 'netlify') {
      console.log(chalk.blue('\\n🚀 Next Steps:'));
      console.log(chalk.gray('1. Install Netlify CLI: npm i -g netlify-cli'));
      console.log(chalk.gray('2. Login: netlify login'));
      console.log(chalk.gray('3. Init: netlify init'));
      console.log(chalk.gray('4. Deploy: netlify deploy --prod'));
    } else if (options.provider === 'docker') {
      console.log(chalk.blue('\\n🚀 Next Steps:'));
      console.log(chalk.gray('1. Build image: docker build -t openscad-customizer .'));
      console.log(chalk.gray('2. Run container: docker-compose up -d'));
      console.log(chalk.gray('3. Access at: http://localhost:8080'));
    } else if (options.provider === 'validation') {
      console.log(chalk.blue('\\n🚀 Next Steps:'));
      console.log(chalk.gray('1. Customize golden fixtures in tests/golden-fixtures.json'));
      console.log(chalk.gray('2. Run tests: node tests/run-golden-tests.js'));
      console.log(chalk.gray('3. Integrate into CI pipeline'));
    }
    
  } catch (err) {
    console.error(chalk.red(`✗ Unexpected error: ${err.message}`));
    if (process.env.DEBUG) {
      console.error(err.stack);
    }
    process.exit(1);
  }
}
