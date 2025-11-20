# @dfatwork-pkgs/oras-client

Complete Node.js/TypeScript bindings for the Rust [oci-client](https://github.com/oras-project/oci-client) library (v0.14), enabling full OCI Registry As Storage (ORAS) operations.

## Architecture

This project provides **two layers**:

1. **Pure Rust Bindings** - Thin wrappers around `oci-client` methods
2. **High-Level TypeScript API** - ORAS-style operations, multi-platform support, stream utilities

See [ARCHITECTURE.md](../../ARCHITECTURE.md) for detailed architecture documentation.

## Features

- ✅ **Pure Rust Bindings**: Direct access to `oci-client` methods (manifest, blob operations)
- ✅ **High-Level TypeScript API**: ORAS-style push/pull, multi-platform, artifact management
- ✅ **Auto Image Index Resolution**: Transparently handles multi-platform artifacts
- ✅ **Stream-Based Layer Access**: Pull layers as streams for tar.gz extraction
- ✅ **Full Authentication**: Basic, Bearer token, and Docker config integration
- ✅ **Multi-Platform Support**: Create and manage OCI image indexes for multiple architectures
- ✅ **Async/Await**: Full async support for all operations
- ✅ **Multi-arch Builds**: Automated builds for Linux, macOS, Windows (x64, ARM64)
- ✅ **TypeScript**: Full type definitions with excellent IDE support
- ✅ **Production Ready**: 32 passing tests against Zot registry

## Installation

```bash
npm install @dfatwork-pkgs/oras-client
# or
pnpm add @dfatwork-pkgs/oras-client
```

## Quick Start

### High-Level API (Recommended)

```typescript
import { OrasClient, FileLayer, PushArtifactOptions } from '@dfatwork-pkgs/oras-client';

const client = new OrasClient(); // Use OrasClient(true) for insecure/HTTP

// Push an artifact with multiple files
const files: FileLayer[] = [
  {
    path: './config.json',
    mediaType: 'application/json',
    title: 'config.json'
  }
];

const options: PushArtifactOptions = {
  artifactType: 'application/vnd.example.config.v1',
  annotations: {
    'org.opencontainers.image.created': new Date().toISOString()
  }
};

await client.pushArtifact(
  'localhost:5000/my-artifact:v1',
  files,
  options,
  { username: 'user', password: 'pass' }
);

// Pull an artifact
const downloadedFiles = await client.pullArtifact(
  'localhost:5000/my-artifact:v1',
  './output',
  { username: 'user', password: 'pass' }
);
```

### Option 2: Pure Rust Bindings (Low-Level)

```typescript
import { OrasClient, AuthOptions } from 'oras-client-node-bindings';

const client = new OrasClient();

// Pull manifest
const manifestJson = await client.pullManifest('localhost:5000/artifact:v1', auth);

// Pull blob
const blobData = await client.pullBlob('localhost:5000/artifact:v1', 'sha256:abc...', auth);

// Push blob
const digest = await client.pushBlob('localhost:5000/artifact:v1', Buffer.from('data'), auth);

// Push manifest (you construct the manifest JSON)
await client.pushManifest('localhost:5000/artifact:v1', manifestJson, auth);
```

## API Reference

### Pure Rust Bindings

Complete bindings for all `oci-client` methods. See [`BINDINGS_REFERENCE.md`](./BINDINGS_REFERENCE.md) for full API documentation.

#### Core Methods

```typescript
class OrasClient {
  constructor(insecure?: boolean);
  
  // Manifest operations (supports both Image Manifests AND Image Indexes/manifest lists)
  pullManifest(imageRef: string, auth?: AuthOptions): Promise<string>;
  pushManifest(imageRef: string, manifestJson: string, auth?: AuthOptions): Promise<string>;
  pushManifestList(imageRef: string, manifestListJson: string, auth?: AuthOptions): Promise<string>;
  pullManifestRaw(imageRef: string, auth?: AuthOptions): Promise<Buffer>;
  pushManifestRaw(imageRef: string, manifestBytes: Buffer, contentType: string, auth?: AuthOptions): Promise<string>;
  fetchManifestDigest(imageRef: string, auth?: AuthOptions): Promise<string>;
  pullManifestAndConfig(imageRef: string, auth?: AuthOptions): Promise<string>;
  deleteManifest(imageRef: string, auth?: AuthOptions): Promise<string>;
  
  // Blob operations
  pullBlob(imageRef: string, digest: string, auth?: AuthOptions): Promise<Buffer>;
  pushBlob(imageRef: string, data: Buffer, auth?: AuthOptions): Promise<string>;
  mountBlob(targetRef: string, fromRef: string, digest: string, auth?: AuthOptions): Promise<string>;
  
  // Repository operations
  listTags(imageRef: string, auth?: AuthOptions): Promise<Array<string>>;
  
  // OCI 1.1 Referrers API
  pullReferrers(imageRef: string, artifactType?: string, auth?: AuthOptions): Promise<string>;
}
```

**Note**: 
- `pullManifest()` and `pushManifest()` work with **both** OCI Image Manifests (single platform) and OCI Image Indexes (manifest lists for multi-platform)
- `pushManifestList()` is a convenience method specifically for pushing Image Indexes (manifest lists)

### High-Level TypeScript API

See [`src/high-level.ts`](./src/high-level.ts) for full API documentation.

#### ORAS-Style Operations

- `pushArtifact(ref, files, options?, auth?)` - Push multiple files as an artifact
- `pullArtifact(ref, outputDir, auth?)` - Pull and extract artifact files
- `copyArtifact(sourceRef, targetRef, auth?)` - Copy artifacts between registries
- `attachArtifact(subjectRef, artifactRef, files, artifactType, annotations?, auth?)` - Attach artifacts

#### Multi-Platform Operations

- `pushManifestIndex(ref, manifests, annotations?, auth?)` - Create OCI image index
- `pullManifestForPlatform(ref, platform, auth?)` - Pull platform-specific manifest
- `listPlatforms(ref, auth?)` - List available platforms
- `pushArtifactMultiPlatform(ref, platformArtifacts, options?, auth?)` - Push for multiple platforms

## Authentication

```typescript
interface AuthOptions {
  username?: string;      // Basic authentication
  password?: string;
  token?: string;         // Bearer token authentication
  useDockerConfig?: boolean; // Use Docker config file (~/.docker/config.json)
}
```

**Supported registries**: Docker Hub, GHCR, GitLab, ACR, GAR, ECR, Harbor, Artifactory, Quay.io, and more.

See [`AUTHENTICATION.md`](./AUTHENTICATION.md) for details.

## Multi-Platform Support

Push artifacts for multiple platforms:

```typescript
import { OrasClient, Platform, FileLayer } from 'oras-client-node-bindings/high-level';

const client = new OrasClient();

const platformArtifacts: Array<[Platform, FileLayer[]]> = [
  [
    { os: 'linux', architecture: 'amd64' },
    [{ path: './bin/app-linux-amd64', mediaType: 'application/octet-stream' }]
  ],
  [
    { os: 'linux', architecture: 'arm64' },
    [{ path: './bin/app-linux-arm64', mediaType: 'application/octet-stream' }]
  ],
  [
    { os: 'darwin', architecture: 'arm64' },
    [{ path: './bin/app-darwin-arm64', mediaType: 'application/octet-stream' }]
  ]
];

await client.pushArtifactMultiPlatform(
  'registry.io/myapp:v1',
  platformArtifacts,
  { artifactType: 'application/vnd.example.binary' },
  auth
);
```

See [`MULTI_PLATFORM.md`](./MULTI_PLATFORM.md) for complete documentation.

## CLI Tool

A complete ORAS CLI is available in the `cli/` directory:

```bash
cd cli
npm install
npm run build

# Push artifact
./dist/cli.js push localhost:5000/artifact:v1 file1.txt file2.json \
  --artifact-type application/vnd.example.config.v1 \
  --insecure

# Pull artifact
./dist/cli.js pull localhost:5000/artifact:v1 --output ./downloads --insecure

# Multi-platform
./dist/cli.js push-multiplatform localhost:5000/app:v1 \
  --platform linux/amd64:./bin/app-linux-amd64 \
  --platform linux/arm64:./bin/app-linux-arm64 \
  --insecure
```

See [`cli/README.md`](./cli/README.md) for full CLI documentation.

## Building from Source

Requirements:
- Rust (latest stable)
- Node.js (>= 18)

```bash
npm install
npm run build
```

## Multi-Architecture Support

This project uses GitHub Actions to automatically build native bindings for:
- Linux: x64 (glibc, musl), ARM64
- macOS: x64, ARM64 (Apple Silicon)
- Windows: x64, ARM64

## Examples

See [`examples/ts-app/`](./examples/ts-app/) for a comprehensive demonstration of all features.

## Documentation

- **[ARCHITECTURE.md](./ARCHITECTURE.md)** - Architecture and design decisions
- **[AUTHENTICATION.md](./AUTHENTICATION.md)** - Authentication methods and registry compatibility
- **[MULTI_PLATFORM.md](./MULTI_PLATFORM.md)** - Multi-platform support guide
- **[cli/README.md](./cli/README.md)** - CLI usage guide

## License

Apache-2.0

## Contributing

Contributions welcome! Please open an issue or PR.
