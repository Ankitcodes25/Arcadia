const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const frontend = path.resolve(root, 'frontend');

function copyRecursive(src, dest) {
  if (!fs.existsSync(src)) return;
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src)) {
      copyRecursive(path.join(src, entry), path.join(dest, entry));
    }
  } else {
    fs.copyFileSync(src, dest);
  }
}

function main() {
  if (!fs.existsSync(frontend)) fs.mkdirSync(frontend);

  const itemsToCopy = [
    'index.html',
    'vite.config.js',
    'src',
  ];

  // optional configs
  ['tailwind.config.cjs', 'postcss.config.cjs', 'postcss.config.js'].forEach((cfg) => {
    if (fs.existsSync(path.join(root, cfg))) itemsToCopy.push(cfg);
  });

  for (const item of itemsToCopy) {
    const src = path.join(root, item);
    const dest = path.join(frontend, item);
    console.log('Copying', src, '→', dest);
    copyRecursive(src, dest);
  }

  // create frontend/package.json by reading root package.json and copying relevant fields
  const rootPkgPath = path.join(root, 'package.json');
  if (!fs.existsSync(rootPkgPath)) {
    console.error('root package.json not found, skipping package.json creation');
    return;
  }

  const rootPkg = JSON.parse(fs.readFileSync(rootPkgPath, 'utf8'));
  const frontendPkg = {
    name: rootPkg.name ? `${rootPkg.name}-frontend` : 'frontend',
    private: true,
    version: '0.0.0',
    scripts: {
      dev: 'vite',
      build: 'vite build',
      preview: 'vite preview',
      'build:css': rootPkg.scripts && rootPkg.scripts['build:css'] ? rootPkg.scripts['build:css'] : undefined,
    },
    dependencies: rootPkg.dependencies || {},
    devDependencies: rootPkg.devDependencies || {},
  };

  // remove undefined scripts
  Object.keys(frontendPkg.scripts).forEach((k) => frontendPkg.scripts[k] === undefined && delete frontendPkg.scripts[k]);

  fs.writeFileSync(path.join(frontend, 'package.json'), JSON.stringify(frontendPkg, null, 2));
  console.log('Created frontend/package.json');

  // helpful README
  const readme = `This folder is a copy of the frontend app.

Run these commands from the project root after copying:

  node tools/copy-frontend.js
  cd frontend
  npm install
  npm run dev

The script copies: index.html, vite.config.js, src/, and optional Tailwind/PostCSS configs.
`;
  fs.writeFileSync(path.join(frontend, 'README.md'), readme);
  console.log('Wrote frontend/README.md');
}

main();
