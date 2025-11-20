# ORAS Client Node.js Bindings

Node.js bindings for the Rust [oci-client](https://github.com/oras-project/oras-rs) library, providing OCI Registry As Storage (ORAS) functionality with multi-platform support.

[![CI](https://github.com/YOUR_USERNAME/oras-client-node-bindings/actions/workflows/CI.yml/badge.svg)](https://github.com/YOUR_USERNAME/oras-client-node-bindings/actions/workflows/CI.yml)

## 📦 Packages

This monorepo contains two packages:

### [@dfatwork-pkgs/oras-client](./packages/oras-client) - Core Library

Pure Rust bindings + high-level TypeScript API for ORAS operations.

**Install:**
```bash
npm install @dfatwork-pkgs/oras-client
# or
pnpm add @dfatwork-pkgs/oras-client
```

**Quick Start:**
```typescript
import { OrasClient } from '@dfatwork-pkgs/oras-client';

const client = new OrasClient();

// Push artifact
await client.pushArtifact('localhost:5000/myapp:v1', [
  { path: './config.json', mediaType: 'application/json' }
]);

// Pull artifact (auto-resolves multi-platform)
await client.pullArtifact('localhost:5000/myapp:v1', './output');

// Stream layers for tar.gz extraction
const layers = await client.pullArtifactStreams('localhost:5000/myapp:v1');
```

### [@dfatwork-pkgs/oras-cli](./packages/oras-cli) - Command-Line Interface

ORAS CLI implemented in TypeScript.

**Install:**
```bash
npm install -g @dfatwork-pkgs/oras-cli
# or
pnpm add -g @dfatwork-pkgs/oras-cli
```

**Usage:**
```bash
oras-js push localhost:5000/artifact:v1 file.txt
oras-js pull localhost:5000/artifact:v1 -o ./output
oras-js manifest localhost:5000/artifact:v1
oras-js copy localhost:5000/src:v1 localhost:5000/dst:v1
```

## ✨ Features

- ✅ **Pure Rust bindings** to oci-client (fast & safe)
- ✅ **High-level TypeScript API** for convenience
- ✅ **Auto Image Index resolution** - transparently handles multi-platform artifacts
- ✅ **Stream-based layer access** - for tar.gz extraction and custom processing
- ✅ **Multi-platform support** - build and distribute for multiple OS/architectures
- ✅ **Full authentication** - Basic, Bearer, Docker config
- ✅ **Cross-platform native binaries** - macOS (Intel/Apple Silicon), Windows, Linux (x64/ARM64)
- ✅ **TypeScript types** - full type safety
- ✅ **Comprehensive tests** - 32 passing tests with Zot registry

## 🚀 Quick Start

### Prerequisites
- Node.js >= 10
- Rust and Cargo (for building from source)
- pnpm (recommended) or npm

### Installation

```bash
# Install pnpm
npm install -g pnpm

# Clone repository
git clone https://github.com/YOUR_USERNAME/oras-client-node-bindings.git
cd oras-client-node-bindings

# Install dependencies
pnpm install

# Build everything
pnpm build

# Run tests
pnpm test
```

## 📚 Documentation

- [Library Documentation](./packages/oras-client/README.md) - API reference and examples
- [CLI Documentation](./packages/oras-cli/README.md) - CLI commands and usage
- [Architecture](./ARCHITECTURE.md) - Design principles and structure
- [Examples](./packages/oras-client/examples/) - Code examples

## 🏗️ Architecture

### Pure Bindings Principle

**Rust** (`packages/oras-client/src/lib.rs`):
- Pure, thin bindings to `oci-client`
- Direct method wrappers
- Type conversions only
- No business logic

**TypeScript** (`packages/oras-client/src/high-level.ts`):
- All high-level functionality
- Multi-platform support
- ORAS-style operations
- Stream utilities
- CLI logic

This separation ensures:
- ✅ Maintainability - easy to extend in TypeScript
- ✅ Performance - critical ops in Rust, convenience in JS
- ✅ Flexibility - use low-level or high-level API
- ✅ Type safety - full TypeScript support

## 🧪 Testing

```bash
# Run all tests
pnpm test

# Run tests in watch mode
pnpm --filter @dfatwork-pkgs/oras-client test:watch

# Run e2e tests only
pnpm --filter @dfatwork-pkgs/oras-client test:e2e
```

Tests automatically start a Zot registry in Podman for full integration testing.

## 📦 Publishing to npm

### Update Package Names

Before publishing, update the package names in:

1. `packages/oras-client/package.json`:
```json
{
  "name": "@YOUR_NPM_USERNAME/oras-client",
  ...
}
```

2. `packages/oras-cli/package.json`:
```json
{
  "name": "@YOUR_NPM_USERNAME/oras-cli",
  "dependencies": {
    "@YOUR_NPM_USERNAME/oras-client": "workspace:*"
  },
  ...
}
```

### Publish

```bash
# Login to npm
npm login

# Build everything
pnpm build

# Publish library
cd packages/oras-client
pnpm publish --access public

# Publish CLI
cd ../oras-cli
pnpm publish --access public
```

### Automated Publishing

The CI workflow automatically publishes to npm on pushes to `main` branch. Set up:

1. Create npm access token: https://www.npmjs.com/settings/YOUR_USERNAME/tokens
2. Add `NPM_TOKEN` secret to GitHub repository settings
3. Push to `main` branch

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Run tests (`pnpm test`)
5. Build (`pnpm build`)
6. Commit your changes (`git commit -m 'Add amazing feature'`)
7. Push to the branch (`git push origin feature/amazing-feature`)
8. Open a Pull Request

## 📄 License

Apache-2.0

## 🔗 Links

- [oci-client (Rust)](https://github.com/oras-project/oras-rs)
- [ORAS Project](https://oras.land/)
- [OCI Distribution Spec](https://github.com/opencontainers/distribution-spec)
- [napi-rs](https://napi.rs/)

## 🙏 Acknowledgments

- [oci-client](https://github.com/oras-project/oras-rs) - Rust OCI client library
- [napi-rs](https://napi.rs/) - Rust to Node.js bindings framework
- [ORAS Project](https://oras.land/) - OCI Registry As Storage
