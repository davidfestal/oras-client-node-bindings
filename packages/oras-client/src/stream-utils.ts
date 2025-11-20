/**
 * Utility functions for working with streams and tar.gz extraction
 */

import { Readable } from 'stream';
import * as zlib from 'zlib';

/**
 * Convert a Buffer to a Node.js Readable stream
 */
export function bufferToStream(buffer: Buffer): Readable {
  const stream = new Readable();
  stream.push(buffer);
  stream.push(null);
  return stream;
}

/**
 * Create a gunzip stream for decompressing gzip data
 */
export function createGunzipStream(): zlib.Gunzip {
  return zlib.createGunzip();
}

/**
 * Create an unzip stream for decompressing zip data
 */
export function createInflateStream(): zlib.Inflate {
  return zlib.createInflate();
}

/**
 * Helper to check if a layer is a tar.gz based on media type
 */
export function isTarGz(mediaType: string): boolean {
  return mediaType.includes('tar+gzip') || 
         mediaType.includes('tar.gz') ||
         mediaType === 'application/vnd.oci.image.layer.v1.tar+gzip' ||
         mediaType === 'application/vnd.docker.image.rootfs.diff.tar.gzip';
}

/**
 * Helper to check if a layer is a tar based on media type
 */
export function isTar(mediaType: string): boolean {
  return mediaType.includes('tar') && !isTarGz(mediaType);
}

/**
 * Extract tar.gz buffer to a directory using a callback for each file
 * Note: This requires the 'tar' package to be installed
 * 
 * @example
 * ```typescript
 * import { extractTarGz } from '@dfatwork-pkgs/oras-client/stream-utils';
 * import * as tar from 'tar';
 * 
 * const layers = await client.pullArtifactStreams('localhost:5000/app:v1');
 * for (const layer of layers) {
 *   if (isTarGz(layer.mediaType)) {
 *     await extractTarGz(layer.data, './output', (entry) => {
 *       console.log('Extracting:', entry.path);
 *     });
 *   }
 * }
 * ```
 */
export async function extractTarGz(
  buffer: Buffer,
  outputDir: string,
  onEntry?: (entry: { path: string; size: number }) => void
): Promise<void> {
  // This is a helper that requires the 'tar' package
  // Users can implement their own extraction logic or use this helper
  let tar: any;
  try {
    // @ts-ignore - tar is an optional peer dependency
    tar = await import('tar');
  } catch (e) {
    throw new Error('The "tar" package is required for extractTarGz. Install it with: npm install tar');
  }

  const stream = bufferToStream(buffer);
  const gunzip = createGunzipStream();
  
  return new Promise((resolve, reject) => {
    stream
      .pipe(gunzip)
      .pipe(tar.extract({
        cwd: outputDir,
        onentry: onEntry ? (entry: any) => {
          onEntry({ path: entry.path, size: entry.size });
        } : undefined
      }))
      .on('finish', resolve)
      .on('error', reject);
  });
}

/**
 * Get a readable stream from a Buffer with optional gunzip
 */
export function getLayerStream(buffer: Buffer, decompress: boolean = false): Readable {
  const stream = bufferToStream(buffer);
  
  if (decompress) {
    return stream.pipe(createGunzipStream());
  }
  
  return stream;
}

