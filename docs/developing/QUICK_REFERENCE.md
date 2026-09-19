# Dev quick reference

## Work on a change

```bash
git checkout develop
git pull
git checkout -b feat/short-name

npm install
npm run dev
```

## Before a PR

```bash
npm run test:run
npm run test:e2e
npm run lint
npm run format
npm run build
```

## Commit message shape

Use one of: `feat:`, `fix:`, `docs:`, `test:`, `chore:`.
