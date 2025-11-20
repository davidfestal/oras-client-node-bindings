#!/usr/bin/env node

import { Command } from 'commander';
import { OrasClient, AuthOptions, FileLayer, PushArtifactOptions, Platform, ManifestDescriptor } from '@oras/client';
import * as fs from 'fs';
import * as path from 'path';
import chalk from 'chalk';

const program = new Command();

// Helper to get auth from environment or flags
function getAuth(username?: string, password?: string): AuthOptions | undefined {
  const user = username || process.env.ORAS_USERNAME;
  const pass = password || process.env.ORAS_PASSWORD;
  
  if (user && pass) {
    return { username: user, password: pass };
  }
  return undefined;
}

// Helper to create client
function createClient(insecure: boolean = false): OrasClient {
  return new OrasClient(insecure);
}

// ===== PUSH Command =====
program
  .command('push')
  .description('Push files to a registry as an artifact')
  .argument('<ref>', 'artifact reference (e.g., localhost:5000/artifact:v1)')
  .argument('<files...>', 'files to push')
  .option('--artifact-type <type>', 'artifact type (e.g., application/vnd.example.config.v1)')
  .option('--annotation <key=value>', 'manifest annotations (can be specified multiple times)', (value, previous) => {
    return previous.concat([value]);
  }, [] as string[])
  .option('--config-media-type <type>', 'config media type')
  .option('--insecure', 'allow insecure connections (HTTP)', false)
  .option('-u, --username <username>', 'registry username')
  .option('-p, --password <password>', 'registry password')
  .action(async (ref: string, files: string[], options: any) => {
    try {
      console.log(chalk.blue(`Pushing ${files.length} file(s) to ${ref}...`));
      
      const client = createClient(options.insecure);
      const auth = getAuth(options.username, options.password);
      
      // Parse annotations
      const annotations: Record<string, string> = {};
      if (Array.isArray(options.annotation)) {
        options.annotation.forEach((ann: string) => {
          const [key, ...valueParts] = ann.split('=');
          if (key && valueParts.length > 0) {
            annotations[key] = valueParts.join('=');
          }
        });
      }
      
      // Prepare file layers
      const fileLayers: FileLayer[] = files.map(filePath => {
        if (!fs.existsSync(filePath)) {
          throw new Error(`File not found: ${filePath}`);
        }
        
        const ext = path.extname(filePath).toLowerCase();
        let mediaType = 'application/octet-stream';
        
        // Auto-detect common media types
        const mediaTypes: Record<string, string> = {
          '.json': 'application/json',
          '.txt': 'text/plain',
          '.md': 'text/markdown',
          '.yaml': 'application/yaml',
          '.yml': 'application/yaml',
          '.xml': 'application/xml',
          '.tar': 'application/x-tar',
          '.gz': 'application/gzip',
          '.zip': 'application/zip',
        };
        
        if (ext in mediaTypes) {
          mediaType = mediaTypes[ext];
        }
        
        return {
          path: filePath,
          mediaType,
          title: path.basename(filePath),
          annotations: undefined
        };
      });
      
      const pushOptions: PushArtifactOptions = {
        artifactType: options.artifactType,
        annotations: Object.keys(annotations).length > 0 ? annotations : undefined,
        configMediaType: options.configMediaType,
        configAnnotations: undefined
      };
      
      await client.pushArtifact(ref, fileLayers, pushOptions, auth);
      
      console.log(chalk.green(`✓ Pushed ${ref}`));
      console.log(chalk.gray(`  Artifact Type: ${options.artifactType || 'N/A'}`));
      console.log(chalk.gray(`  Files: ${files.length}`));
      
    } catch (error: any) {
      console.error(chalk.red(`✗ Push failed: ${error.message}`));
      process.exit(1);
    }
  });

// ===== PULL Command =====
program
  .command('pull')
  .description('Pull an artifact from a registry')
  .argument('<ref>', 'artifact reference')
  .option('-o, --output <dir>', 'output directory', '.')
  .option('--insecure', 'allow insecure connections (HTTP)', false)
  .option('-u, --username <username>', 'registry username')
  .option('-p, --password <password>', 'registry password')
  .action(async (ref: string, options: any) => {
    try {
      console.log(chalk.blue(`Pulling ${ref}...`));
      
      const client = createClient(options.insecure);
      const auth = getAuth(options.username, options.password);
      
      const files = await client.pullArtifact(ref, options.output, auth);
      
      console.log(chalk.green(`✓ Pulled ${ref}`));
      console.log(chalk.gray(`  Downloaded ${files.length} file(s) to ${options.output}:`));
      files.forEach((file: string) => console.log(chalk.gray(`    - ${path.basename(file)}`)));
      
    } catch (error: any) {
      console.error(chalk.red(`✗ Pull failed: ${error.message}`));
      process.exit(1);
    }
  });

// ===== MANIFEST FETCH Command =====
program
  .command('manifest')
  .description('Fetch and display the manifest')
  .argument('<ref>', 'artifact reference')
  .option('--insecure', 'allow insecure connections (HTTP)', false)
  .option('-u, --username <username>', 'registry username')
  .option('-p, --password <password>', 'registry password')
  .option('--pretty', 'pretty print JSON', true)
  .action(async (ref: string, options: any) => {
    try {
      const client = createClient(options.insecure);
      const auth = getAuth(options.username, options.password);
      
      const manifestJson = await client.pullManifest(ref, auth);
      
      if (options.pretty) {
        const manifest = JSON.parse(manifestJson);
        console.log(JSON.stringify(manifest, null, 2));
      } else {
        console.log(manifestJson);
      }
      
    } catch (error: any) {
      console.error(chalk.red(`✗ Failed to fetch manifest: ${error.message}`));
      process.exit(1);
    }
  });

// ===== COPY Command =====
program
  .command('copy')
  .description('Copy an artifact from one location to another')
  .argument('<source>', 'source artifact reference')
  .argument('<target>', 'target artifact reference')
  .option('--insecure', 'allow insecure connections (HTTP)', false)
  .option('-u, --username <username>', 'registry username')
  .option('-p, --password <password>', 'registry password')
  .action(async (source: string, target: string, options: any) => {
    try {
      console.log(chalk.blue(`Copying ${source} → ${target}...`));
      
      const client = createClient(options.insecure);
      const auth = getAuth(options.username, options.password);
      
      await client.copyArtifact(source, target, auth);
      
      console.log(chalk.green(`✓ Copied successfully`));
      
    } catch (error: any) {
      console.error(chalk.red(`✗ Copy failed: ${error.message}`));
      process.exit(1);
    }
  });

// ===== ATTACH Command =====
program
  .command('attach')
  .description('Attach an artifact to a subject')
  .argument('<subject>', 'subject artifact reference')
  .argument('<files...>', 'files to attach')
  .option('--artifact-ref <ref>', 'reference for the attached artifact (required)')
  .option('--artifact-type <type>', 'artifact type (required)')
  .option('--annotation <key=value>', 'artifact annotations (can be specified multiple times)', (value, previous) => {
    return previous.concat([value]);
  }, [] as string[])
  .option('--insecure', 'allow insecure connections (HTTP)', false)
  .option('-u, --username <username>', 'registry username')
  .option('-p, --password <password>', 'registry password')
  .action(async (subject: string, files: string[], options: any) => {
    try {
      if (!options.artifactRef) {
        throw new Error('--artifact-ref is required');
      }
      if (!options.artifactType) {
        throw new Error('--artifact-type is required');
      }
      
      console.log(chalk.blue(`Attaching ${files.length} file(s) to ${subject}...`));
      
      const client = createClient(options.insecure);
      const auth = getAuth(options.username, options.password);
      
      // Parse annotations
      const annotations: Record<string, string> = {};
      if (Array.isArray(options.annotation)) {
        options.annotation.forEach((ann: string) => {
          const [key, ...valueParts] = ann.split('=');
          if (key && valueParts.length > 0) {
            annotations[key] = valueParts.join('=');
          }
        });
      }
      
      const fileLayers: FileLayer[] = files.map(filePath => ({
        path: filePath,
        mediaType: 'application/octet-stream',
        title: path.basename(filePath),
        annotations: undefined
      }));
      
      await client.attachArtifact(
        subject,
        options.artifactRef,
        fileLayers,
        options.artifactType,
        Object.keys(annotations).length > 0 ? annotations : undefined,
        auth
      );
      
      console.log(chalk.green(`✓ Attached ${options.artifactRef} to ${subject}`));
      
    } catch (error: any) {
      console.error(chalk.red(`✗ Attach failed: ${error.message}`));
      process.exit(1);
    }
  });

// ===== BLOB Commands =====
const blobCmd = program
  .command('blob')
  .description('Blob operations');

blobCmd
  .command('fetch')
  .description('Fetch a blob by digest')
  .argument('<ref>', 'artifact reference')
  .argument('<digest>', 'blob digest (sha256:...)')
  .option('-o, --output <file>', 'output file (default: stdout)')
  .option('--insecure', 'allow insecure connections (HTTP)', false)
  .option('-u, --username <username>', 'registry username')
  .option('-p, --password <password>', 'registry password')
  .action(async (ref: string, digest: string, options: any) => {
    try {
      const client = createClient(options.insecure);
      const auth = getAuth(options.username, options.password);
      
      const data = await client.pullBlob(ref, digest, auth);
      
      if (options.output) {
        fs.writeFileSync(options.output, data);
        console.log(chalk.green(`✓ Blob saved to ${options.output}`));
      } else {
        process.stdout.write(data);
      }
      
    } catch (error: any) {
      console.error(chalk.red(`✗ Fetch failed: ${error.message}`));
      process.exit(1);
    }
  });

blobCmd
  .command('push')
  .description('Push a blob')
  .argument('<ref>', 'artifact reference')
  .argument('<file>', 'file to push')
  .option('--insecure', 'allow insecure connections (HTTP)', false)
  .option('-u, --username <username>', 'registry username')
  .option('-p, --password <password>', 'registry password')
  .action(async (ref: string, file: string, options: any) => {
    try {
      const client = createClient(options.insecure);
      const auth = getAuth(options.username, options.password);
      
      const data = fs.readFileSync(file);
      const digest = await client.pushBlob(ref, data, auth);
      
      console.log(chalk.green(`✓ Pushed blob`));
      console.log(chalk.gray(`  Digest: ${digest}`));
      
    } catch (error: any) {
      console.error(chalk.red(`✗ Push failed: ${error.message}`));
      process.exit(1);
    }
  });

// ===== MULTI-PLATFORM Commands =====
const manifestCmd = program
  .command('manifest-index')
  .description('Multi-platform manifest index operations');

manifestCmd
  .command('create')
  .description('Create a multi-platform manifest index')
  .argument('<ref>', 'manifest index reference')
  .option('--manifest <digest:platform...>', 'manifest digest and platform (format: digest,os,arch)', [])
  .option('--annotation <key=value>', 'index annotations (can be specified multiple times)', (value, previous) => {
    return previous.concat([value]);
  }, [] as string[])
  .option('--insecure', 'allow insecure connections (HTTP)', false)
  .option('-u, --username <username>', 'registry username')
  .option('-p, --password <password>', 'registry password')
  .action(async (ref: string, options: any) => {
    try {
      console.log(chalk.blue(`Creating manifest index ${ref}...`));
      
      const client = createClient(options.insecure);
      const auth = getAuth(options.username, options.password);
      
      // Parse manifest descriptors
      const manifests: ManifestDescriptor[] = [];
      if (Array.isArray(options.manifest)) {
        options.manifest.forEach((manifestStr: string) => {
          const [digest, os, arch, ...rest] = manifestStr.split(',');
          if (!digest || !os || !arch) {
            throw new Error(`Invalid manifest format: ${manifestStr}. Expected: digest,os,arch[,variant]`);
          }
          
          const platform: Platform = {
            os,
            architecture: arch,
            variant: rest[0]
          };
          
          manifests.push({
            digest,
            mediaType: 'application/vnd.oci.image.manifest.v1+json',
            size: 0, // Will be fetched by the registry
            platform,
            annotations: undefined
          });
        });
      }
      
      // Parse annotations
      const annotations: Record<string, string> = {};
      if (Array.isArray(options.annotation)) {
        options.annotation.forEach((ann: string) => {
          const [key, ...valueParts] = ann.split('=');
          if (key && valueParts.length > 0) {
            annotations[key] = valueParts.join('=');
          }
        });
      }
      
      await client.pushManifestIndex(
        ref,
        manifests,
        Object.keys(annotations).length > 0 ? annotations : undefined,
        auth
      );
      
      console.log(chalk.green(`✓ Created manifest index ${ref}`));
      console.log(chalk.gray(`  Platforms: ${manifests.length}`));
      
    } catch (error: any) {
      console.error(chalk.red(`✗ Failed to create manifest index: ${error.message}`));
      process.exit(1);
    }
  });

manifestCmd
  .command('list')
  .description('List platforms in a manifest index')
  .argument('<ref>', 'manifest index reference')
  .option('--insecure', 'allow insecure connections (HTTP)', false)
  .option('-u, --username <username>', 'registry username')
  .option('-p, --password <password>', 'registry password')
  .action(async (ref: string, options: any) => {
    try {
      const client = createClient(options.insecure);
      const auth = getAuth(options.username, options.password);
      
      const platforms = await client.listPlatforms(ref, auth);
      
      if (platforms.length === 0) {
        console.log(chalk.yellow('No platforms found (single-platform image or empty index)'));
      } else {
        console.log(chalk.green(`Platforms available:`));
        platforms.forEach((p: Platform) => {
          const variant = p.variant ? ` (${p.variant})` : '';
          console.log(chalk.gray(`  - ${p.os}/${p.architecture}${variant}`));
        });
      }
      
    } catch (error: any) {
      console.error(chalk.red(`✗ Failed to list platforms: ${error.message}`));
      process.exit(1);
    }
  });

// Update PULL command to support platform selection
program
  .command('pull-platform')
  .description('Pull an artifact for a specific platform')
  .argument('<ref>', 'artifact reference')
  .option('--platform <platform>', 'platform in format os/arch[/variant]', 'linux/amd64')
  .option('-o, --output <dir>', 'output directory', '.')
  .option('--insecure', 'allow insecure connections (HTTP)', false)
  .option('-u, --username <username>', 'registry username')
  .option('-p, --password <password>', 'registry password')
  .action(async (ref: string, options: any) => {
    try {
      console.log(chalk.blue(`Pulling ${ref} for platform ${options.platform}...`));
      
      const client = createClient(options.insecure);
      const auth = getAuth(options.username, options.password);
      
      // Parse platform
      const [os, arch, variant] = options.platform.split('/');
      if (!os || !arch) {
        throw new Error('Platform must be in format os/arch[/variant]');
      }
      
      const platform: Platform = {
        os,
        architecture: arch,
        variant
      };
      
      const manifestJson = await client.pullManifestForPlatform(ref, platform, auth);
      const manifest = JSON.parse(manifestJson);
      
      console.log(chalk.green(`✓ Found manifest for ${options.platform}`));
      console.log(chalk.gray(`  Layers: ${manifest.layers?.length || 0}`));
      
      // Now pull the artifact using the standard pull
      // (This would need enhancement to actually extract the files)
      console.log(chalk.blue(`Pulling artifact layers...`));
      const files = await client.pullArtifact(ref, options.output, auth);
      
      console.log(chalk.green(`✓ Downloaded ${files.length} file(s) to ${options.output}`));
      
    } catch (error: any) {
      console.error(chalk.red(`✗ Pull failed: ${error.message}`));
      process.exit(1);
    }
  });

// Add multi-platform push command
program
  .command('push-multiplatform')
  .description('Push artifacts for multiple platforms and create an index')
  .argument('<ref>', 'artifact reference (will be used for the index)')
  .option('--platform <platform:files...>', 'platform and files (format: os/arch:file1,file2,...)', [])
  .option('--artifact-type <type>', 'artifact type')
  .option('--annotation <key=value>', 'manifest annotations (can be specified multiple times)', (value, previous) => {
    return previous.concat([value]);
  }, [] as string[])
  .option('--insecure', 'allow insecure connections (HTTP)', false)
  .option('-u, --username <username>', 'registry username')
  .option('-p, --password <password>', 'registry password')
  .action(async (ref: string, options: any) => {
    try {
      console.log(chalk.blue(`Pushing multi-platform artifact to ${ref}...`));
      
      const client = createClient(options.insecure);
      const auth = getAuth(options.username, options.password);
      
      // Parse platform artifacts
      const platformArtifacts: Array<[Platform, FileLayer[]]> = [];
      
      if (Array.isArray(options.platform)) {
        options.platform.forEach((platformStr: string) => {
          const [platformPart, filesPart] = platformStr.split(':');
          if (!platformPart || !filesPart) {
            throw new Error(`Invalid platform format: ${platformStr}. Expected: os/arch:file1,file2,...`);
          }
          
          const [os, arch, variant] = platformPart.split('/');
          if (!os || !arch) {
            throw new Error('Platform must be in format os/arch[/variant]');
          }
          
          const platform: Platform = {
            os,
            architecture: arch,
            variant
          };
          
          const files: FileLayer[] = filesPart.split(',').map(filePath => ({
            path: filePath.trim(),
            mediaType: 'application/octet-stream',
            title: path.basename(filePath.trim()),
            annotations: undefined
          }));
          
          platformArtifacts.push([platform, files]);
        });
      }
      
      if (platformArtifacts.length === 0) {
        throw new Error('No platforms specified. Use --platform os/arch:file1,file2,...');
      }
      
      // Parse annotations
      const annotations: Record<string, string> = {};
      if (Array.isArray(options.annotation)) {
        options.annotation.forEach((ann: string) => {
          const [key, ...valueParts] = ann.split('=');
          if (key && valueParts.length > 0) {
            annotations[key] = valueParts.join('=');
          }
        });
      }
      
      const pushOptions: PushArtifactOptions = {
        artifactType: options.artifactType,
        annotations: Object.keys(annotations).length > 0 ? annotations : undefined,
        configMediaType: undefined,
        configAnnotations: undefined
      };
      
      await client.pushArtifactMultiPlatform(ref, platformArtifacts, pushOptions, auth);
      
      console.log(chalk.green(`✓ Pushed multi-platform artifact to ${ref}`));
      console.log(chalk.gray(`  Platforms: ${platformArtifacts.length}`));
      platformArtifacts.forEach(([p, files]) => {
        console.log(chalk.gray(`    - ${p.os}/${p.architecture}: ${files.length} file(s)`));
      });
      
    } catch (error: any) {
      console.error(chalk.red(`✗ Push failed: ${error.message}`));
      process.exit(1);
    }
  });

// Program setup
program
  .name('oras-js')
  .description('ORAS CLI implemented in TypeScript')
  .version('1.0.0');

program.parse();

