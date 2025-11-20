/**
 * ORAS Client Node.js Bindings
 * 
 * Main entry point that exports both native bindings and high-level API
 */

// Re-export native bindings (except OrasClient which we override)
export { AuthOptions, NapiImageLayer, NapiConfig, NapiImageData, NapiPushResponse } from './generated';
export { OrasClient as NativeOrasClient } from './generated';

// Re-export high-level API (this includes the high-level OrasClient)
export * from './high-level';

// Re-export stream utilities
export * from './stream-utils';

// Default export: high-level OrasClient
export { OrasClient as default } from './high-level';

