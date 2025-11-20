/**
 * Example: Using stream utilities for tar.gz extraction
 * 
 * This example demonstrates:
 * 1. Pulling artifacts with automatic Image Index resolution
 * 2. Using pullArtifactStreams for streaming layer data
 * 3. Extracting tar.gz layers on-the-fly
 */

import { OrasClient, bufferToStream, getLayerStream, isTarGz, extractTarGz } from '../src/index';
import * as fs from 'fs/promises';
import * as path from 'path';

async function main() {
  const client = new OrasClient();
  
  // Example 1: Pull artifact with automatic Image Index resolution
  console.log('\n=== Example 1: Auto-resolving Image Index ===');
  const imageRef = 'localhost:5001/myapp:v1';
  const outputDir = './output';
  
  try {
    // This will automatically detect if it's an Image Index
    // and resolve to the current platform (darwin-arm64, linux-amd64, etc.)
    const files = await client.pullArtifact(imageRef, outputDir);
    console.log('✅ Downloaded files:', files);
  } catch (error) {
    console.error('❌ Pull failed:', error);
  }

  // Example 2: Pull layers as streams
  console.log('\n=== Example 2: Pull Layers as Streams ===');
  
  try {
    const layers = await client.pullArtifactStreams(imageRef);
    
    for (const layer of layers) {
      console.log(`\n📦 Layer: ${layer.digest}`);
      console.log(`   Media Type: ${layer.mediaType}`);
      console.log(`   Size: ${layer.data.length} bytes`);
      console.log(`   Filename: ${layer.filename || 'N/A'}`);
      
      // Check if it's a tar.gz layer
      if (isTarGz(layer.mediaType)) {
        console.log('   🗜️  This is a tar.gz layer!');
        
        // Convert to stream for processing
        const stream = bufferToStream(layer.data);
        
        // You can pipe this to gunzip/untar
        // Example: stream.pipe(zlib.createGunzip()).pipe(tar.extract(...))
      }
    }
  } catch (error) {
    console.error('❌ Stream pull failed:', error);
  }

  // Example 3: Extract tar.gz directly
  console.log('\n=== Example 3: Extract tar.gz Directly ===');
  
  try {
    const layers = await client.pullArtifactStreams(imageRef);
    
    for (const layer of layers) {
      if (isTarGz(layer.mediaType)) {
        const extractDir = path.join(outputDir, 'extracted', layer.digest.substring(0, 12));
        await fs.mkdir(extractDir, { recursive: true });
        
        console.log(`\n🗜️  Extracting ${layer.filename || layer.digest} to ${extractDir}`);
        
        // Extract the tar.gz
        await extractTarGz(layer.data, extractDir, (entry) => {
          console.log(`   📄 ${entry.path} (${entry.size} bytes)`);
        });
        
        console.log('✅ Extraction complete!');
      }
    }
  } catch (error) {
    console.error('❌ Extraction failed:', error);
    if (error instanceof Error && error.message.includes('tar')) {
      console.log('\n💡 Tip: Install tar package with: npm install tar @types/tar');
    }
  }

  // Example 4: Manual stream processing
  console.log('\n=== Example 4: Manual Stream Processing ===');
  
  try {
    const layers = await client.pullArtifactStreams(imageRef);
    
    for (const layer of layers) {
      // Get a readable stream (optionally decompressed)
      const stream = getLayerStream(layer.data, isTarGz(layer.mediaType));
      
      // You can now pipe this stream anywhere
      // Example: stream.pipe(process.stdout)
      // Example: stream.pipe(fs.createWriteStream('output.tar'))
      
      console.log(`📊 Created stream for ${layer.digest.substring(0, 12)}`);
    }
  } catch (error) {
    console.error('❌ Stream processing failed:', error);
  }

  // Example 5: Pull specific layer by digest
  console.log('\n=== Example 5: Pull Specific Layer ===');
  
  try {
    const digest = 'sha256:abc123...'; // Replace with actual digest
    const layerData = await client.pullLayerStream(imageRef, digest);
    console.log(`✅ Pulled layer ${digest}: ${layerData.length} bytes`);
  } catch (error) {
    console.error('❌ Layer pull failed:', error);
  }
}

// Run examples
main().catch(console.error);

