# ORAS Client Examples

This directory contains examples demonstrating various features of the `@oras/client` library.

## Examples

### `stream-example.ts`

Demonstrates the new streaming capabilities:

1. **Auto-resolving Image Index**: Automatically detects multi-platform artifacts and resolves to the current platform
2. **Pull Layers as Streams**: Get layer data as buffers with metadata for custom processing
3. **Extract tar.gz Directly**: Automatically extract compressed layers
4. **Manual Stream Processing**: Full control over stream processing with Node.js streams
5. **Pull Specific Layers**: Fetch individual layers by digest

## Key Features Demonstrated

### Automatic Image Index Resolution

```typescript
// Automatically resolves to current platform (darwin-arm64, linux-amd64, etc.)
const files = await client.pullArtifact('localhost:5001/myapp:v1', './output');
```

If the artifact is an Image Index (multi-platform), it will automatically:
- Detect the index
- Resolve to the current platform using `pullImageManifest`
- Pull the appropriate manifest for your OS/architecture

### Stream-based Layer Access

```typescript
// Get layers as streams with metadata
const layers = await client.pullArtifactStreams('localhost:5001/myapp:v1');

for (const layer of layers) {
  console.log(layer.mediaType);  // e.g., 'application/vnd.oci.image.layer.v1.tar+gzip'
  console.log(layer.digest);     // e.g., 'sha256:abc123...'
  console.log(layer.data);       // Buffer containing layer data
  console.log(layer.filename);   // From annotations
}
```

### Tar.gz Extraction

```typescript
import { extractTarGz, isTarGz } from '@oras/client';

const layers = await client.pullArtifactStreams(imageRef);

for (const layer of layers) {
  if (isTarGz(layer.mediaType)) {
    await extractTarGz(layer.data, './output', (entry) => {
      console.log(`Extracting: ${entry.path}`);
    });
  }
}
```

**Note**: The `extractTarGz` function requires the `tar` package:
```bash
npm install tar @types/tar
```

### Custom Stream Processing

```typescript
import { bufferToStream, getLayerStream } from '@oras/client';
import * as zlib from 'zlib';
import * as fs from 'fs';

// Convert buffer to stream
const stream = bufferToStream(layer.data);

// Or get a stream with automatic decompression
const decompressed = getLayerStream(layer.data, true);

// Pipe to file
decompressed.pipe(fs.createWriteStream('output.tar'));

// Or process manually
stream.pipe(zlib.createGunzip()).pipe(customProcessor);
```

## Running the Examples

1. **Start a local registry** (if needed):
   ```bash
   podman run -d -p 5001:5000 --name zot ghcr.io/project-zot/zot-linux-amd64:latest
   ```

2. **Build the library**:
   ```bash
   cd packages/oras-client
   pnpm build
   ```

3. **Run the example**:
   ```bash
   npx ts-node examples/stream-example.ts
   ```

## API Reference

### New Methods

#### `pullArtifact(imageRef, outputDir, auth?)`
Pulls an artifact and saves files to disk. Automatically resolves Image Index to current platform.

#### `pullArtifactStreams(imageRef, auth?)`
Returns an array of layer streams with metadata. Automatically resolves Image Index.

```typescript
Array<{
  data: Buffer;
  mediaType: string;
  digest: string;
  annotations?: Record<string, string>;
  filename?: string;
}>
```

#### `pullLayerStream(imageRef, digest, auth?)`
Pulls a specific layer by digest and returns the raw buffer.

### Utility Functions

#### `bufferToStream(buffer: Buffer): Readable`
Converts a Buffer to a Node.js Readable stream.

#### `getLayerStream(buffer: Buffer, decompress?: boolean): Readable`
Creates a readable stream from a buffer, optionally decompressing gzip data.

#### `isTarGz(mediaType: string): boolean`
Checks if a layer's media type indicates tar.gz compression.

#### `isTar(mediaType: string): boolean`
Checks if a layer's media type indicates tar format (without gzip).

#### `extractTarGz(buffer, outputDir, onEntry?): Promise<void>`
Extracts a tar.gz buffer to a directory. Requires `tar` package.

## Use Cases

### 1. Container Image Extraction
Extract container layers to inspect or modify contents:

```typescript
const layers = await client.pullArtifactStreams('docker.io/library/nginx:latest');
for (const layer of layers) {
  if (isTarGz(layer.mediaType)) {
    await extractTarGz(layer.data, `./nginx-layer-${layer.digest.substring(0, 12)}`);
  }
}
```

### 2. Multi-Platform Artifact Distribution
Push and pull artifacts for multiple platforms, with automatic resolution:

```typescript
// Push for multiple platforms
await client.pushArtifactMultiPlatform('myregistry.io/app:v1', [
  [{ os: 'linux', architecture: 'amd64' }, linuxFiles],
  [{ os: 'darwin', architecture: 'arm64' }, macFiles],
]);

// Pull automatically resolves to current platform
const files = await client.pullArtifact('myregistry.io/app:v1', './output');
```

### 3. Streaming Large Artifacts
Process large artifacts without loading everything into memory:

```typescript
const layers = await client.pullArtifactStreams('myregistry.io/bigdata:latest');
for (const layer of layers) {
  const stream = getLayerStream(layer.data, true);
  stream.pipe(customProcessor).pipe(destination);
}
```

## Notes

- All stream methods automatically handle Image Index resolution
- The `tar` package is an optional peer dependency
- Buffers are used instead of true streaming for compatibility with the Rust bindings
- For true streaming support, consider using the native bindings directly

