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
      
      - name: Deploy to Vercel
        uses: amondnet/vercel-action@v25
        with:
          vercel-token: \${{ secrets.VERCEL_TOKEN }}
          vercel-org-id: \${{ secrets.VERCEL_ORG_ID }}
          vercel-project-id: \${{ secrets.VERCEL_PROJECT_ID }}
          vercel-args: '--prod'
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
  
  vercel: {
    name: 'Vercel',
    description: 'Vercel deployment configuration',
    files: {
      'vercel.json': `{
  "version": 2,
  "framework": "vite",
  "buildCommand": "npm run build",
  "outputDirectory": "dist",
  "installCommand": "npm install",
  "devCommand": "npm run dev",
  "cleanUrls": true,
  "trailingSlash": false,
  "headers": [
    {
      "source": "/wasm/(.*)",
      "headers": [
        {
          "key": "Cross-Origin-Opener-Policy",
          "value": "same-origin"
        },
        {
          "key": "Cross-Origin-Embedder-Policy",
          "value": "require-corp"
        }
      ]
    },
    {
      "source": "/(.*)",
      "headers": [
        {
          "key": "X-Content-Type-Options",
          "value": "nosniff"
        },
        {
          "key": "X-Frame-Options",
          "value": "DENY"
        },
        {
          "key": "X-XSS-Protection",
          "value": "1; mode=block"
        }
      ]
    }
  ],
  "rewrites": [
    {
      "source": "/(.*)",
      "destination": "/index.html"
    }
  ]
}
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

[[headers]]
  for = "/wasm/*"
  [headers.values]
    Cross-Origin-Opener-Policy = "same-origin"
    Cross-Origin-Embedder-Policy = "require-corp"

[[headers]]
  for = "/*"
  [headers.values]
    X-Content-Type-Options = "nosniff"
    X-Frame-Options = "DENY"
    X-XSS-Protection = "1; mode=block"
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
    
    // Check provider
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
    
    // Determine output directory
    const outDir = resolve(options.out);
    console.log(chalk.gray(`Output: ${outDir}`));
    
    // Write files
    let filesCreated = 0;
    for (const [filePath, content] of Object.entries(template.files)) {
      const fullPath = join(outDir, filePath);
      const fileDir = fullPath.substring(0, fullPath.lastIndexOf('/') || fullPath.lastIndexOf('\\\\'));
      
      // Create directory if needed
      if (!existsSync(fileDir)) {
        mkdirSync(fileDir, { recursive: true });
      }
      
      // Check if file exists
      if (existsSync(fullPath)) {
        console.log(chalk.yellow(`⚠ Skipped (exists): ${filePath}`));
        continue;
      }
      
      // Write file
      writeFileSync(fullPath, content, 'utf-8');
      console.log(chalk.green(`✓ Created: ${filePath}`));
      filesCreated++;
    }
    
    console.log(chalk.blue(`\n📋 Summary: ${filesCreated} file(s) created`));
    
    // Provider-specific instructions
    if (options.provider === 'github') {
      console.log(chalk.blue('\\n🚀 Next Steps:'));
      console.log(chalk.gray('1. Add secrets to GitHub repository:'));
      console.log(chalk.gray('   - VERCEL_TOKEN'));
      console.log(chalk.gray('   - VERCEL_ORG_ID'));
      console.log(chalk.gray('   - VERCEL_PROJECT_ID'));
      console.log(chalk.gray('2. Push to GitHub to trigger workflow'));
    } else if (options.provider === 'vercel') {
      console.log(chalk.blue('\\n🚀 Next Steps:'));
      console.log(chalk.gray('1. Install Vercel CLI: npm i -g vercel'));
      console.log(chalk.gray('2. Login: vercel login'));
      console.log(chalk.gray('3. Deploy: vercel --prod'));
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
