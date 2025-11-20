# Architecture: Pure Rust Bindings + TypeScript High-Level API

## Overview

This project follows a **clean separation of concerns** architecture:

- **Rust** (`packages/oras-client/src/lib.rs`): Pure, thin bindings to `oci-client`
- **TypeScript** (`packages/oras-client/src/high-level.ts`): All high-level ORAS operations
- **CLI** (`packages/oras-cli/`): Command-line tool built on the TypeScript API

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                      CLI Tool (@dfatwork-pkgs/oras-cli)     │
│                  packages/oras-cli/src/cli.ts                │
│  Commands: push, pull, manifest, copy, blob, etc.           │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│         TypeScript High-Level API (@dfatwork-pkgs/oras-client)             │
│         packages/oras-client/src/high-level.ts               │
│                                                              │
│  • pushArtifact()            • pullArtifact()               │
│  • pullArtifactStreams()     • pullLayerStream()            │
│  • copyArtifact()            • attachArtifact()             │
│  • pushManifestIndex()       • pullManifestForPlatform()    │
│  • pushArtifactMultiPlatform()                              │
│                                                              │
│  Features:                                                   │
│  - Auto Image Index resolution                              │
│  - Stream-based layer access                                │
│  - Multi-platform support                                   │
│  - File I/O, digest calculation, manifest construction      │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│         Pure Rust Bindings (@dfatwork-pkgs/oras-client/native)             │
│         packages/oras-client/src/lib.rs                      │
│                                                              │
│  • pullManifest()       • pushManifest()                    │
│  • pullBlob()           • pushBlob()                        │
│  • pullImageManifest()  • mountBlob()                       │
│  • fetchManifestDigest()                                    │
│                                                              │
│  Pure wrappers - no business logic                          │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│              Rust oci-client Library v0.14                   │
│              (External crate)                                │
└─────────────────────────────────────────────────────────────┘
```

## Monorepo Structure

```
oras-client-node-bindings/
├── packages/
│   ├── oras-client/                 # @dfatwork-pkgs/oras-client
│   │   ├── src/
│   │   │   ├── lib.rs               # Pure Rust bindings
│   │   │   ├── high-level.ts        # High-level TypeScript API
│   │   │   ├── stream-utils.ts      # Stream utilities
│   │   │   ├── index.ts             # Main entry point
│   │   │   └── generated/           # NAPI-generated bindings
│   │   │       ├── index.js
│   │   │       ├── index.d.ts
│   │   │       └── *.node           # Native binary
│   │   ├── dist/                    # Compiled TypeScript
│   │   │   ├── index.js
│   │   │   ├── high-level.js
│   │   │   ├── stream-utils.js
│   │   │   └── generated/           # Copied native bindings
│   │   ├── test/                    # E2E tests
│   │   │   └── e2e.test.ts
│   │   ├── examples/                # Usage examples
│   │   ├── Cargo.toml               # Rust dependencies
│   │   └── package.json
│   │
│   └── oras-cli/                    # @dfatwork-pkgs/oras-cli
│       ├── src/
│       │   └── cli.ts               # CLI implementation
│       ├── dist/
│       │   └── cli.js
│       └── package.json
│
├── pnpm-workspace.yaml              # pnpm workspace config
├── package.json                     # Root package.json
├── .github/workflows/CI.yml         # CI/CD pipeline
└── README.md
```

## Pure Bindings Principle

### What's in Rust (lib.rs) ✅

**ONLY** thin wrappers around `oci-client` methods:

- `OrasClient::new(insecure: bool)` - Create client
- `pullManifest(reference, auth)` - Pull manifest JSON
- `pullBlob(reference, digest, auth)` - Pull blob by digest
- `pushBlob(reference, data, digest, auth)` - Push blob
- `pushManifest(reference, manifest, auth)` - Push manifest JSON
- `pullImageManifest(reference, auth)` - Pull with platform resolution
- `fetchManifestDigest(reference, auth)` - Get manifest digest
- `mountBlob(from, to, digest, auth)` - Mount blob between repos

### What's NOT in Rust ❌

- ❌ File I/O operations
- ❌ Digest calculation (SHA-256)
- ❌ Manifest construction
- ❌ Multi-file artifact handling
- ❌ Platform management
- ❌ Image index creation
- ❌ ORAS-style push/pull
- ❌ Copy operations
- ❌ Stream utilities

**All of the above are implemented in TypeScript!**

## TypeScript High-Level API

### Core Features

1. **ORAS-Style Operations**
   ```typescript
   // Push multiple files as an artifact
   await client.pushArtifact(ref, files, options, auth);
   
   // Pull and extract artifact files
   await client.pullArtifact(ref, outputDir, auth);
   
   // Copy artifacts between registries
   await client.copyArtifact(sourceRef, targetRef, auth);
   ```

2. **Auto Image Index Resolution** (NEW!)
   ```typescript
   // Automatically detects and resolves multi-platform artifacts
   const files = await client.pullArtifact(ref, outputDir, auth);
   // If ref points to an Image Index, it auto-resolves to current platform
   ```

3. **Stream-Based Layer Access** (NEW!)
   ```typescript
   // Get layers as streams with metadata
   const layers = await client.pullArtifactStreams(ref, auth);
   for (const layer of layers) {
     console.log(layer.mediaType, layer.digest, layer.filename);
     // layer.data is a Buffer ready for processing
   }
   
   // Pull specific layer by digest
   const layerData = await client.pullLayerStream(ref, digest, auth);
   ```

4. **Stream Utilities**
   ```typescript
   import { bufferToStream, isTarGz, extractTarGz } from '@dfatwork-pkgs/oras-client';
   
   // Check if layer is tar.gz
   if (isTarGz(layer.mediaType)) {
     // Extract directly
     await extractTarGz(layer.data, './output');
   }
   ```

5. **Multi-Platform Support**
   ```typescript
   // Push for multiple platforms
   await client.pushArtifactMultiPlatform(ref, [
     [{ os: 'linux', architecture: 'amd64' }, linuxFiles],
     [{ os: 'darwin', architecture: 'arm64' }, macFiles]
   ], options, auth);
   
   // Create manifest index
   await client.pushManifestIndex(ref, manifests, annotations, auth);
   ```

### Implementation Details

- Uses Node.js `fs/promises` for file operations
- Uses Node.js `crypto` for SHA-256 digest calculation
- Uses Node.js `stream` for stream utilities
- Constructs OCI manifests according to spec
- All logic in pure JavaScript/TypeScript

## Benefits of This Architecture

### 1. Separation of Concerns
- **Rust**: Fast, safe bindings to native code
- **TypeScript**: High-level logic, file I/O, JSON manipulation

### 2. Maintainability
- Rust bindings rarely need changes
- High-level features added in TypeScript without touching Rust
- Easier to debug TypeScript than Rust

### 3. Flexibility
- Users can choose low-level bindings for control
- Or use high-level API for convenience
- Easy to extend with new features

### 4. Performance
- Critical operations (network I/O) happen in Rust
- File I/O and JSON manipulation in Node.js (fast enough)
- No unnecessary data copying

### 5. Type Safety
- Full TypeScript support for both APIs
- Auto-generated types for Rust bindings
- Hand-written types for high-level API

## Package Exports

```json
{
  "name": "@dfatwork-pkgs/oras-client",
  "exports": {
    ".": {
      "require": "./dist/index.js",
      "types": "./dist/index.d.ts"
    },
    "./native": {
      "require": "./dist/generated/index.js",
      "types": "./dist/generated/index.d.ts"
    }
  }
}
```

Users can import:
```typescript
// High-level API (recommended)
import { OrasClient } from '@dfatwork-pkgs/oras-client';

// Low-level bindings (advanced)
import { OrasClient as NativeClient } from '@dfatwork-pkgs/oras-client/native';

// Stream utilities
import { bufferToStream, isTarGz, extractTarGz } from '@dfatwork-pkgs/oras-client';
```

## CLI Tool

The CLI is built entirely on the TypeScript high-level API:

```typescript
import { OrasClient } from '@dfatwork-pkgs/oras-client';

const client = new OrasClient(options.insecure);
await client.pushArtifact(ref, files, options, auth);
```

## Testing Strategy

### E2E Tests (32 tests)

1. **High-Level API Tests**
   - Push/pull artifacts
   - Copy artifacts
   - Blob operations
   - Multi-platform operations

2. **Stream API Tests** (NEW!)
   - Pull artifact layers as streams
   - Pull multiple layers
   - Pull specific layer by digest
   - Layer metadata preservation

3. **Auto-Resolution Tests** (NEW!)
   - Auto-resolve Image Index in pullArtifact
   - Auto-resolve Image Index in pullArtifactStreams
   - Handle single-platform artifacts

4. **CLI Tests**
   - All CLI commands
   - Error handling
   - Interoperability with API

### Test Infrastructure

- **Zot registry** for OCI 1.1 compliance
- **Podman** for container management
- **Jest** for test runner
- **Dynamic port allocation** to avoid conflicts

## CI/CD Pipeline

### Build Matrix (5 platforms)

Optimized for GitHub free tier:

1. **macOS x86_64** - Intel Macs
2. **macOS ARM64** - Apple Silicon (M1/M2/M3)
3. **Windows x64** - Windows users
4. **Linux x64** - Ubuntu, Debian, Fedora, etc.
5. **Linux ARM64** - ARM servers, Raspberry Pi, AWS Graviton

### Workflow Jobs

1. **Build** - Parallel builds for all platforms
2. **Test** - E2E tests with Zot registry
3. **Publish** - Automated npm publishing on main branch

## Summary

✅ **Rust**: Pure bindings, thin wrappers, no business logic  
✅ **TypeScript**: All high-level features, ORAS operations, streams  
✅ **CLI**: Built on TypeScript high-level API  
✅ **Clean architecture**: Each layer does what it does best  
✅ **Flexible**: Use low-level or high-level API as needed  
✅ **Maintainable**: Easy to extend and debug  
✅ **Well-tested**: 32 passing tests with full coverage  

This is the **correct architecture** for Node.js native bindings! 🎉
