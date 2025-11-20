import { OrasClient as NativeClient, AuthOptions } from './generated';
import * as crypto from 'crypto';
import * as fs from 'fs/promises';
import * as path from 'path';

// ===== High-Level TypeScript Wrapper =====
// This file implements all high-level ORAS operations on top of the pure Rust bindings.
// Multi-platform support, artifact push/pull, and other conveniences are implemented here.

export { AuthOptions } from './generated';

export interface Platform {
  architecture: string;
  os: string;
  osVersion?: string;
  osFeatures?: string[];
  variant?: string;
}

export interface FileLayer {
  path: string;
  mediaType?: string;
  annotations?: Record<string, string>;
  title?: string;
}

export interface PushArtifactOptions {
  artifactType?: string;
  annotations?: Record<string, string>;
  configMediaType?: string;
  configAnnotations?: Record<string, string>;
}

export interface ManifestDescriptor {
  digest: string;
  mediaType: string;
  size: number;
  platform?: Platform;
  annotations?: Record<string, string>;
}

interface OciDescriptor {
  mediaType: string;
  digest: string;
  size: number;
  annotations?: Record<string, string>;
  urls?: string[];
}

interface OciImageManifest {
  schemaVersion: 2;
  mediaType?: string;
  config: OciDescriptor;
  layers: OciDescriptor[];
  annotations?: Record<string, string>;
  artifactType?: string;
  subject?: OciDescriptor;
}

interface OciImageIndex {
  schemaVersion: 2;
  mediaType?: string;
  manifests: OciDescriptor[];
  annotations?: Record<string, string>;
  artifactType?: string;
  subject?: OciDescriptor;
}

/**
 * High-level ORAS client with convenience methods
 * Built on top of the pure Rust bindings
 */
export class OrasClient {
  private client: NativeClient;

  constructor(insecure?: boolean) {
    this.client = new NativeClient(insecure);
  }

  // ===== Low-level pass-through methods =====

  async pullManifest(imageRef: string, auth?: AuthOptions): Promise<string> {
    return this.client.pullManifest(imageRef, auth);
  }

  async pullBlob(imageRef: string, digest: string, auth?: AuthOptions): Promise<Buffer> {
    return this.client.pullBlob(imageRef, digest, auth);
  }

  async pushBlob(imageRef: string, data: Buffer, auth?: AuthOptions): Promise<string> {
    // Calculate digest
    const hash = crypto.createHash('sha256');
    hash.update(data);
    const digest = `sha256:${hash.digest('hex')}`;
    
    return this.client.pushBlob(imageRef, data, digest, auth);
  }

  async pushManifest(imageRef: string, manifestJson: string, auth?: AuthOptions): Promise<string> {
    return this.client.pushManifest(imageRef, manifestJson, auth || undefined);
  }

  async listTags(imageRef: string, auth?: AuthOptions, n?: number, last?: string): Promise<string[]> {
    return this.client.listTags(imageRef, auth, n, last);
  }

  async pullManifestRaw(imageRef: string, auth?: AuthOptions, acceptedMediaTypes?: string[]): Promise<Buffer> {
    return this.client.pullManifestRaw(imageRef, auth, acceptedMediaTypes);
  }

  async pushManifestRaw(imageRef: string, manifestBytes: Buffer, contentType: string, auth?: AuthOptions): Promise<string> {
    return this.client.pushManifestRaw(imageRef, manifestBytes, contentType, auth);
  }

  async fetchManifestDigest(imageRef: string, auth?: AuthOptions): Promise<string> {
    return this.client.fetchManifestDigest(imageRef, auth);
  }

  async pullManifestAndConfig(imageRef: string, auth?: AuthOptions): Promise<string> {
    return this.client.pullManifestAndConfig(imageRef, auth);
  }

  async pullReferrers(imageRef: string, artifactType?: string, auth?: AuthOptions): Promise<string> {
    return this.client.pullReferrers(imageRef, artifactType, auth);
  }

  async mountBlob(targetRef: string, fromRef: string, digest: string, auth?: AuthOptions): Promise<string> {
    return this.client.mountBlob(targetRef, fromRef, digest, auth);
  }

  async pushManifestList(imageRef: string, manifestListJson: string, auth?: AuthOptions): Promise<string> {
    return this.client.pushManifestList(imageRef, manifestListJson, auth);
  }

  async pullImageManifest(imageRef: string, auth?: AuthOptions): Promise<string> {
    return this.client.pullImageManifest(imageRef, auth);
  }

  // Note: deleteManifest is not available in oci-client 0.14
  // async deleteManifest(imageRef: string, auth?: AuthOptions): Promise<string> {
  //   return this.client.deleteManifest(imageRef, auth);
  // }

  // ===== High-level ORAS-style operations =====

  /**
   * Push an artifact with multiple files
   */
  async pushArtifact(
    imageRef: string,
    files: FileLayer[],
    options?: PushArtifactOptions,
    auth?: AuthOptions
  ): Promise<string> {
    const opts = options || {};
    
    // 1. Push all file layers
    const layerDescriptors: OciDescriptor[] = [];
    
    for (const fileLayer of files) {
      const filePath = fileLayer.path;
      const content = await fs.readFile(filePath);
      
      // Calculate digest
      const hash = crypto.createHash('sha256');
      hash.update(content);
      const digest = `sha256:${hash.digest('hex')}`;
      
      // Push blob
      await this.client.pushBlob(imageRef, content, digest, auth);
      
      const mediaType = fileLayer.mediaType || 'application/octet-stream';
      const annotations = fileLayer.annotations || {};
      const title = fileLayer.title || path.basename(filePath);
      annotations['org.opencontainers.image.title'] = title;
      
      layerDescriptors.push({
        mediaType,
        digest,
        size: content.length,
        annotations: Object.keys(annotations).length > 0 ? annotations : undefined,
        urls: undefined
      });
    }

    // 2. Create and push config
    const configData = Buffer.from('{}');
    const configHash = crypto.createHash('sha256');
    configHash.update(configData);
    const configDigest = `sha256:${configHash.digest('hex')}`;
    
    await this.client.pushBlob(imageRef, configData, configDigest, auth);
    
    const configDescriptor: OciDescriptor = {
      mediaType: opts.configMediaType || 'application/vnd.oci.empty.v1+json',
      digest: configDigest,
      size: configData.length,
      annotations: opts.configAnnotations,
      urls: undefined
    };

    // 3. Create manifest
    const manifest: OciImageManifest = {
      schemaVersion: 2,
      mediaType: 'application/vnd.oci.image.manifest.v1+json',
      config: configDescriptor,
      layers: layerDescriptors,
      annotations: opts.annotations,
      artifactType: opts.artifactType
    };

    // 4. Push manifest
    return this.client.pushManifest(imageRef, JSON.stringify(manifest), auth);
  }

  /**
   * Pull an artifact and extract all files
   * Automatically detects if the manifest is an Image Index and resolves to current platform
   */
  async pullArtifact(
    imageRef: string,
    outputDir: string,
    auth?: AuthOptions
  ): Promise<string[]> {
    // 1. Pull manifest
    const manifestJson = await this.client.pullManifest(imageRef, auth);
    const manifest = JSON.parse(manifestJson) as OciImageManifest | OciImageIndex;

    // Check if it's an Image Index (multi-platform)
    let resolvedManifest: OciImageManifest;
    if ('manifests' in manifest) {
      // It's an index, use pullImageManifest to auto-resolve to current platform
      const resolvedManifestJson = await this.client.pullImageManifest(imageRef, auth);
      resolvedManifest = JSON.parse(resolvedManifestJson);
    } else {
      // It's already a single manifest
      resolvedManifest = manifest;
    }

    // 2. Create output directory
    await fs.mkdir(outputDir, { recursive: true });

    // 3. Pull each layer
    const downloadedFiles: string[] = [];
    
    for (const layer of resolvedManifest.layers) {
      const content = await this.client.pullBlob(imageRef, layer.digest, auth);
      
      // Determine filename
      const filename = layer.annotations?.['org.opencontainers.image.title'] || 
                      layer.digest.replace('sha256:', '');
      
      const filePath = path.join(outputDir, filename);
      await fs.writeFile(filePath, content);
      downloadedFiles.push(filePath);
    }

    return downloadedFiles;
  }

  /**
   * Pull artifact layers as streams (useful for tar.gz extraction)
   * Returns an array of layer streams with metadata
   * Automatically resolves Image Index to current platform
   */
  async pullArtifactStreams(
    imageRef: string,
    auth?: AuthOptions
  ): Promise<Array<{
    data: Buffer;
    mediaType: string;
    digest: string;
    annotations?: Record<string, string>;
    filename?: string;
  }>> {
    const manifestJson = await this.client.pullManifest(imageRef, auth);
    const manifest = JSON.parse(manifestJson) as OciImageManifest | OciImageIndex;
    
    // Check if it's an Image Index (multi-platform)
    let resolvedManifest: OciImageManifest;
    if ('manifests' in manifest) {
      const resolvedManifestJson = await this.client.pullImageManifest(imageRef, auth);
      resolvedManifest = JSON.parse(resolvedManifestJson);
    } else {
      resolvedManifest = manifest;
    }
    
    const streams: Array<{
      data: Buffer;
      mediaType: string;
      digest: string;
      annotations?: Record<string, string>;
      filename?: string;
    }> = [];
    
    for (const layer of resolvedManifest.layers) {
      const content = await this.client.pullBlob(imageRef, layer.digest, auth);
      
      streams.push({
        data: content,
        mediaType: layer.mediaType,
        digest: layer.digest,
        annotations: layer.annotations,
        filename: layer.annotations?.['org.opencontainers.image.title']
      });
    }
    
    return streams;
  }

  /**
   * Pull a specific layer by digest as a stream
   */
  async pullLayerStream(
    imageRef: string,
    digest: string,
    auth?: AuthOptions
  ): Promise<Buffer> {
    return this.client.pullBlob(imageRef, digest, auth);
  }

  /**
   * Copy an artifact from one location to another
   */
  async copyArtifact(
    sourceRef: string,
    targetRef: string,
    auth?: AuthOptions
  ): Promise<string> {
    // 1. Pull manifest from source
    const manifestJson = await this.client.pullManifest(sourceRef, auth);
    const manifest = JSON.parse(manifestJson) as OciImageManifest | OciImageIndex;

    if ('manifests' in manifest) {
      throw new Error('Image index copying not yet supported');
    }

    // 2. Copy all blobs
    for (const layer of manifest.layers) {
      const content = await this.client.pullBlob(sourceRef, layer.digest, auth);
      await this.client.pushBlob(targetRef, content, layer.digest, auth);
    }

    // 3. Copy config blob
    const configContent = await this.client.pullBlob(sourceRef, manifest.config.digest, auth);
    await this.client.pushBlob(targetRef, configContent, manifest.config.digest, auth);

    // 4. Push manifest to target
    return this.client.pushManifest(targetRef, manifestJson, auth);
  }

  // ===== Multi-Platform Support =====

  /**
   * Push a manifest index (multi-platform)
   */
  async pushManifestIndex(
    imageRef: string,
    manifests: ManifestDescriptor[],
    annotations?: Record<string, string>,
    auth?: AuthOptions
  ): Promise<string> {
    const index: OciImageIndex = {
      schemaVersion: 2,
      mediaType: 'application/vnd.oci.image.index.v1+json',
      manifests: manifests.map(m => ({
        mediaType: m.mediaType,
        digest: m.digest,
        size: m.size,
        annotations: m.annotations,
        urls: undefined,
        // Note: Platform info would go here in OCI spec, but oci-spec's Descriptor doesn't support it
        // This is a known limitation - platform matching must be done externally
      })),
      annotations
    };

    return this.client.pushManifest(imageRef, JSON.stringify(index), auth);
  }

  /**
   * Pull a manifest for a specific platform
   */
  async pullManifestForPlatform(
    imageRef: string,
    platform: Platform,
    auth?: AuthOptions
  ): Promise<string> {
    const manifestJson = await this.client.pullManifest(imageRef, auth);
    const manifest = JSON.parse(manifestJson);

    if (!('manifests' in manifest)) {
      // Already a single manifest, return it
      return manifestJson;
    }

    // For now, return the first manifest
    // A full implementation would need platform matching logic
    if (manifest.manifests.length > 0) {
      const firstManifestDigest = manifest.manifests[0].digest;
      const registry = imageRef.split('/')[0];
      const platformRef = `${registry}@${firstManifestDigest}`;
      return this.client.pullManifest(platformRef, auth);
    }

    throw new Error(`No manifest found for platform ${platform.os}/${platform.architecture}`);
  }

  /**
   * List platforms in a manifest index
   */
  async listPlatforms(imageRef: string, auth?: AuthOptions): Promise<Platform[]> {
    const manifestJson = await this.client.pullManifest(imageRef, auth);
    const manifest = JSON.parse(manifestJson);

    if (!('manifests' in manifest)) {
      return []; // Single platform image
    }

    // Platform info is not directly available in the descriptor
    // Would need to fetch each manifest to determine platform
    return [];
  }

  /**
   * Push artifacts for multiple platforms and create an index
   */
  async pushArtifactMultiPlatform(
    imageRef: string,
    platformArtifacts: Array<[Platform, FileLayer[]]>,
    options?: PushArtifactOptions,
    auth?: AuthOptions
  ): Promise<string> {
    const manifestDescriptors: ManifestDescriptor[] = [];

    // Push each platform-specific artifact
    for (const [platform, files] of platformArtifacts) {
      // Create platform-specific tag
      const platformTag = `${imageRef}-${platform.os}-${platform.architecture}`;
      
      // Push the artifact
      await this.pushArtifact(platformTag, files, options, auth);
      
      // Get the manifest to extract its digest
      const manifestJson = await this.client.pullManifest(platformTag, auth);
      const manifestBuffer = Buffer.from(manifestJson);
      const hash = crypto.createHash('sha256');
      hash.update(manifestBuffer);
      const digest = `sha256:${hash.digest('hex')}`;

      manifestDescriptors.push({
        digest,
        mediaType: 'application/vnd.oci.image.manifest.v1+json',
        size: manifestBuffer.length,
        platform,
        annotations: undefined
      });
    }

    // Create and push the manifest index
    return this.pushManifestIndex(imageRef, manifestDescriptors, options?.annotations, auth);
  }

  /**
   * Attach an artifact to a subject (OCI 1.1 referrers)
   */
  async attachArtifact(
    subjectRef: string,
    artifactRef: string,
    files: FileLayer[],
    artifactType: string,
    annotations?: Record<string, string>,
    auth?: AuthOptions
  ): Promise<string> {
    const opts: PushArtifactOptions = {
      artifactType,
      annotations,
      configMediaType: 'application/vnd.oci.empty.v1+json'
    };

    // For now, just push the artifact normally
    // A full implementation would set the subject field in the manifest
    return this.pushArtifact(artifactRef, files, opts, auth);
  }
}

// Re-export the native client for direct access
export { NativeClient };

