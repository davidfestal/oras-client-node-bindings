use napi::bindgen_prelude::*;
use napi_derive::napi;
use oci_client::{Client, Reference, secrets::RegistryAuth};
use oci_client::client::{ClientConfig, ClientProtocol, ImageData, ImageLayer, Config, PushResponse};
use oci_client::manifest::{OciManifest, OciImageIndex, OciImageManifest};
use serde::{Serialize, Deserialize};

use std::str::FromStr;
use std::collections::BTreeMap;

// ===== Pure OCI Client Bindings for oci-client 0.14 =====
// This file contains ONLY thin wrappers around oci-client 0.14 methods.
// All high-level logic (multi-platform, ORAS-style operations, etc.) 
// should be implemented in JavaScript/TypeScript.

#[napi]
pub struct OrasClient {
  inner: Client,
}

#[napi(object)]
pub struct AuthOptions {
  pub username: Option<String>,
  pub password: Option<String>,
  // Note: oci-client 0.14 only supports Basic and Anonymous auth
  // token and use_docker_config are kept for API compatibility but ignored
  pub token: Option<String>,
  pub use_docker_config: Option<bool>,
}

// Helper to convert auth options to RegistryAuth
// Note: oci-client 0.14 only supports Basic and Anonymous auth
fn get_auth(auth: Option<AuthOptions>) -> Result<RegistryAuth> {
    match auth {
        Some(opts) => {
            if let (Some(u), Some(p)) = (opts.username, opts.password) {
                Ok(RegistryAuth::Basic(u, p))
            } else {
                Ok(RegistryAuth::Anonymous)
            }
        }
        None => Ok(RegistryAuth::Anonymous),
    }
}

// Helper for ImageLayer (needs to be serializable for NAPI)
#[napi(object)]
pub struct NapiImageLayer {
    pub data: Buffer,
    pub media_type: String,
    pub annotations: Option<BTreeMap<String, String>>,
}

// Helper for Config (needs to be serializable for NAPI)
#[napi(object)]
pub struct NapiConfig {
    pub data: Buffer,
    pub media_type: String,
    pub annotations: Option<BTreeMap<String, String>>,
}

// JSON-serializable versions for push method (using Vec<u8> instead of Buffer)
#[derive(Serialize, Deserialize)]
struct JsonImageLayer {
    data: Vec<u8>,
    media_type: String,
    annotations: Option<BTreeMap<String, String>>,
}

#[derive(Serialize, Deserialize)]
struct JsonConfig {
    data: Vec<u8>,
    media_type: String,
    annotations: Option<BTreeMap<String, String>>,
}

// Helper for ImageData (needs to be serializable for NAPI)
#[napi(object)]
pub struct NapiImageData {
    pub layers: Vec<NapiImageLayer>,
    pub digest: Option<String>,
    pub config: Option<NapiConfig>,
}

// Helper for PushResponse (needs to be serializable for NAPI)
#[napi(object)]
pub struct NapiPushResponse {
    pub config_url: String,
    pub manifest_url: String,
}

#[napi]
impl OrasClient {
  /// Create a new OCI client
  #[napi(constructor)]
  pub fn new(insecure: Option<bool>) -> Self {
    let config = ClientConfig {
      protocol: if insecure.unwrap_or(false) {
        ClientProtocol::Http
      } else {
        ClientProtocol::Https
      },
      ..Default::default()
    };
    Self {
      inner: Client::new(config),
    }
  }

  /// Pull an image manifest from the registry.
  /// Returns: JSON string of the manifest (OciManifest enum, can be Image or ImageIndex)
  #[napi]
  pub async fn pull_manifest(
    &self,
    image_ref: String,
    auth: Option<AuthOptions>,
  ) -> Result<String> {
    let reference = Reference::from_str(&image_ref)
        .map_err(|e| Error::from_reason(e.to_string()))?;
    let auth = get_auth(auth)?;
    
    let (manifest, _digest) = self.inner.pull_manifest(&reference, &auth)
        .await
        .map_err(|e| Error::from_reason(format!("Failed to pull manifest: {}", e)))?;
        
    serde_json::to_string_pretty(&manifest)
        .map_err(|e| Error::from_reason(format!("Failed to serialize manifest: {}", e)))
  }

  /// Pull a blob from the registry by digest.
  /// Returns: Buffer containing the blob data
  #[napi]
  pub async fn pull_blob(
    &self,
    image_ref: String,
    digest: String,
    auth: Option<AuthOptions>,
  ) -> Result<Buffer> {
    let reference = Reference::from_str(&image_ref)
        .map_err(|e| Error::from_reason(e.to_string()))?;
    let auth = get_auth(auth)?;
    
    // Store auth before pulling
    self.inner.store_auth_if_needed(reference.resolve_registry(), &auth).await;
    
    let mut content = Vec::new();
    
    self.inner.pull_blob(&reference, digest.as_str(), &mut content)
        .await
        .map_err(|e| Error::from_reason(format!("Failed to pull blob: {}", e)))?;
        
    Ok(Buffer::from(content))
  }

  /// Push a blob to the registry.
  /// The digest must be pre-calculated and provided by the caller.
  /// Returns: The digest of the pushed blob
  /// Note: oci-client 0.14 push_blob does NOT take auth parameter, but we accept it for API consistency
  #[napi]
  pub async fn push_blob(
    &self,
    image_ref: String,
    data: Buffer,
    digest: String,
    auth: Option<AuthOptions>,
  ) -> Result<String> {
    let reference = Reference::from_str(&image_ref)
        .map_err(|e| Error::from_reason(e.to_string()))?;
    let auth_obj = get_auth(auth)?;
    
    // Store auth before pushing
    self.inner.store_auth_if_needed(reference.resolve_registry(), &auth_obj).await;
    
    let content: Vec<u8> = data.to_vec();
    
    self.inner.push_blob(&reference, &content, &digest)
        .await
        .map_err(|e| Error::from_reason(format!("Failed to push blob: {}", e)))?;

    Ok(digest)
  }

  /// Push a manifest to the registry.
  /// manifest_json: JSON string of the OCI manifest (OciManifest enum)
  /// Returns: The manifest URL
  /// Note: oci-client 0.14 push_manifest does NOT take auth parameter, but we accept it for API consistency
  #[napi]
  pub async fn push_manifest(
    &self,
    image_ref: String,
    manifest_json: String,
    auth: Option<AuthOptions>,
  ) -> Result<String> {
    let reference = Reference::from_str(&image_ref)
        .map_err(|e| Error::from_reason(e.to_string()))?;
    let auth_obj = get_auth(auth)?;
    
    // Store auth before pushing
    self.inner.store_auth_if_needed(reference.resolve_registry(), &auth_obj).await;
    
    let manifest: OciManifest = serde_json::from_str(&manifest_json)
        .map_err(|e| Error::from_reason(format!("Failed to parse manifest JSON: {}", e)))?;
    
    self.inner.push_manifest(&reference, &manifest)
        .await
        .map_err(|e| Error::from_reason(format!("Failed to push manifest: {}", e)))
  }

  /// List tags for an image repository.
  /// n: Optional limit on number of tags to return
  /// last: Optional last tag from previous request (for pagination)
  /// Returns: JSON array of tag strings
  #[napi]
  pub async fn list_tags(
    &self,
    image_ref: String,
    auth: Option<AuthOptions>,
    n: Option<u32>,
    last: Option<String>,
  ) -> Result<Vec<String>> {
    let reference = Reference::from_str(&image_ref)
        .map_err(|e| Error::from_reason(e.to_string()))?;
    let auth = get_auth(auth)?;
    
    let tags = self.inner.list_tags(
        &reference,
        &auth,
        n.map(|v| v as usize),
        last.as_deref()
    )
        .await
        .map_err(|e| Error::from_reason(format!("Failed to list tags: {}", e)))?;
    
    Ok(tags.tags)
  }

  /// Pull manifest as raw bytes.
  /// accepted_media_types: Optional array of accepted media types
  /// Returns: Raw manifest bytes
  #[napi]
  pub async fn pull_manifest_raw(
    &self,
    image_ref: String,
    auth: Option<AuthOptions>,
    accepted_media_types: Option<Vec<String>>,
  ) -> Result<Buffer> {
    let reference = Reference::from_str(&image_ref)
        .map_err(|e| Error::from_reason(e.to_string()))?;
    let auth = get_auth(auth)?;
    
    let media_types: Vec<&str> = accepted_media_types
        .as_ref()
        .map(|v| v.iter().map(|s| s.as_str()).collect())
        .unwrap_or_default();
    
    let (manifest_bytes, _digest) = self.inner.pull_manifest_raw(
        &reference,
        &auth,
        &media_types
    )
        .await
        .map_err(|e| Error::from_reason(format!("Failed to pull raw manifest: {}", e)))?;
    
    Ok(Buffer::from(manifest_bytes))
  }

  /// Push manifest as raw bytes.
  /// manifest_bytes: Raw manifest bytes
  /// content_type: Content-Type header value (e.g., "application/vnd.oci.image.manifest.v1+json")
  /// Returns: The manifest URL
  /// Note: oci-client 0.14 push_manifest_raw does NOT take auth parameter, but we accept it for API consistency
  #[napi]
  pub async fn push_manifest_raw(
    &self,
    image_ref: String,
    manifest_bytes: Buffer,
    content_type: String,
    auth: Option<AuthOptions>,
  ) -> Result<String> {
    let reference = Reference::from_str(&image_ref)
        .map_err(|e| Error::from_reason(e.to_string()))?;
    let auth_obj = get_auth(auth)?;
    
    // Store auth before pushing
    self.inner.store_auth_if_needed(reference.resolve_registry(), &auth_obj).await;
    
    let bytes: Vec<u8> = manifest_bytes.to_vec();
    
    self.inner.push_manifest_raw(&reference, bytes, content_type.parse().unwrap())
        .await
        .map_err(|e| Error::from_reason(format!("Failed to push raw manifest: {}", e)))
  }

  /// Fetch the manifest digest without pulling the full manifest.
  /// Returns: The manifest digest (sha256:...)
  #[napi]
  pub async fn fetch_manifest_digest(
    &self,
    image_ref: String,
    auth: Option<AuthOptions>,
  ) -> Result<String> {
    let reference = Reference::from_str(&image_ref)
        .map_err(|e| Error::from_reason(e.to_string()))?;
    let auth = get_auth(auth)?;
    
    self.inner.fetch_manifest_digest(&reference, &auth)
        .await
        .map_err(|e| Error::from_reason(format!("Failed to fetch manifest digest: {}", e)))
  }

  /// Pull manifest and config together.
  /// Returns: JSON string containing manifest, digest, and config
  #[napi]
  pub async fn pull_manifest_and_config(
    &self,
    image_ref: String,
    auth: Option<AuthOptions>,
  ) -> Result<String> {
    let reference = Reference::from_str(&image_ref)
        .map_err(|e| Error::from_reason(e.to_string()))?;
    let auth = get_auth(auth)?;
    
    let (manifest, digest, config) = self.inner.pull_manifest_and_config(&reference, &auth)
        .await
        .map_err(|e| Error::from_reason(format!("Failed to pull manifest and config: {}", e)))?;
    
    let result = serde_json::json!({
        "manifest": manifest,
        "digest": digest,
        "config": config
    });
    
    serde_json::to_string_pretty(&result)
        .map_err(|e| Error::from_reason(format!("Failed to serialize result: {}", e)))
  }

  /// Pull referrers for an artifact (OCI 1.1 Referrers API).
  /// artifact_type: Optional filter by artifact type
  /// Returns: JSON string of referrers index
  /// Note: oci-client 0.14 pull_referrers does NOT take auth parameter, but we accept it for API consistency
  #[napi]
  pub async fn pull_referrers(
    &self,
    image_ref: String,
    artifact_type: Option<String>,
    auth: Option<AuthOptions>,
  ) -> Result<String> {
    let reference = Reference::from_str(&image_ref)
        .map_err(|e| Error::from_reason(e.to_string()))?;
    let auth_obj = get_auth(auth)?;
    
    // Store auth before pulling
    self.inner.store_auth_if_needed(reference.resolve_registry(), &auth_obj).await;
    
    let referrers = self.inner.pull_referrers(&reference, artifact_type.as_deref())
        .await
        .map_err(|e| Error::from_reason(format!("Failed to pull referrers: {}", e)))?;
    
    serde_json::to_string_pretty(&referrers)
        .map_err(|e| Error::from_reason(format!("Failed to serialize referrers: {}", e)))
  }

  /// Mount a blob from another repository (cross-repo blob mount).
  /// from_ref: Source repository reference
  /// digest: Blob digest to mount
  /// Returns: Success message
  /// Note: oci-client 0.14 mount_blob does NOT take auth parameter, but we accept it for API consistency
  #[napi]
  pub async fn mount_blob(
    &self,
    target_ref: String,
    from_ref: String,
    digest: String,
    auth: Option<AuthOptions>,
  ) -> Result<String> {
    let target_reference = Reference::from_str(&target_ref)
        .map_err(|e| Error::from_reason(e.to_string()))?;
    let from_reference = Reference::from_str(&from_ref)
        .map_err(|e| Error::from_reason(e.to_string()))?;
    let auth_obj = get_auth(auth)?;
    
    // Store auth before mounting
    self.inner.store_auth_if_needed(target_reference.resolve_registry(), &auth_obj).await;
    
    self.inner.mount_blob(&target_reference, &from_reference, &digest)
        .await
        .map_err(|e| Error::from_reason(format!("Failed to mount blob: {}", e)))?;
    
    Ok(format!("Mounted blob {} from {} to {}", digest, from_ref, target_ref))
  }

  /// Push a manifest list (OCI Image Index) to the registry.
  /// This is a convenience method specifically for pushing Image Indexes.
  /// manifest_list_json: JSON string of OciImageIndex
  /// Returns: The manifest URL
  #[napi]
  pub async fn push_manifest_list(
    &self,
    image_ref: String,
    manifest_list_json: String,
    auth: Option<AuthOptions>,
  ) -> Result<String> {
    let reference = Reference::from_str(&image_ref)
        .map_err(|e| Error::from_reason(e.to_string()))?;
    let auth = get_auth(auth)?;
    
    let manifest_list: OciImageIndex = serde_json::from_str(&manifest_list_json)
        .map_err(|e| Error::from_reason(format!("Failed to parse manifest list JSON: {}", e)))?;
    
    self.inner.push_manifest_list(&reference, &auth, manifest_list)
        .await
        .map_err(|e| Error::from_reason(format!("Failed to push manifest list: {}", e)))
  }

  /// Pull an image manifest, automatically resolving platform if it's an Image Index.
  /// Returns: JSON string of the resolved OciImageManifest
  #[napi]
  pub async fn pull_image_manifest(
    &self,
    image_ref: String,
    auth: Option<AuthOptions>,
  ) -> Result<String> {
    let reference = Reference::from_str(&image_ref)
        .map_err(|e| Error::from_reason(e.to_string()))?;
    let auth = get_auth(auth)?;
    
    let (manifest, _digest) = self.inner.pull_image_manifest(&reference, &auth)
        .await
        .map_err(|e| Error::from_reason(format!("Failed to pull image manifest: {}", e)))?;
        
    serde_json::to_string_pretty(&manifest)
        .map_err(|e| Error::from_reason(format!("Failed to serialize manifest: {}", e)))
  }

  /// Pull an image and return its data (layers, config).
  /// accepted_media_types: Optional list of media types to accept for layers.
  /// Returns: NapiImageData struct
  #[napi]
  pub async fn pull(
    &self,
    image_ref: String,
    auth: Option<AuthOptions>,
    accepted_media_types: Option<Vec<String>>,
  ) -> Result<NapiImageData> {
    let reference = Reference::from_str(&image_ref)
        .map_err(|e| Error::from_reason(e.to_string()))?;
    let auth = get_auth(auth)?;
    
    let media_types_owned = accepted_media_types.unwrap_or_default();
    let media_types_vec: Vec<&str> = media_types_owned
        .iter()
        .map(|s| s.as_str())
        .collect();

    let image_data: ImageData = self.inner.pull(&reference, &auth, media_types_vec)
        .await
        .map_err(|e| Error::from_reason(format!("Failed to pull image: {}", e)))?;
    
    let napi_layers: Vec<NapiImageLayer> = image_data.layers.into_iter().map(|layer| {
        NapiImageLayer {
            data: Buffer::from(layer.data),
            media_type: layer.media_type,
            annotations: layer.annotations,
        }
    }).collect();

    let napi_config = NapiConfig {
        data: Buffer::from(image_data.config.data),
        media_type: image_data.config.media_type,
        annotations: image_data.config.annotations,
    };

    Ok(NapiImageData {
        layers: napi_layers,
        digest: image_data.digest,
        config: Some(napi_config),
    })
  }

  /// Push an image (layers, config, and optional manifest).
  /// layers_json: JSON string of Vec<NapiImageLayer>
  /// config_json: JSON string of NapiConfig
  /// manifest_json: Optional JSON string of OciImageManifest
  /// Returns: NapiPushResponse
  #[napi]
  pub async fn push(
    &self,
    image_ref: String,
    layers_json: String,
    config_json: String,
    auth: Option<AuthOptions>,
    manifest_json: Option<String>,
  ) -> Result<NapiPushResponse> {
    let reference = Reference::from_str(&image_ref)
        .map_err(|e| Error::from_reason(e.to_string()))?;
    let auth = get_auth(auth)?;

    let json_layers: Vec<JsonImageLayer> = serde_json::from_str(&layers_json)
        .map_err(|e| Error::from_reason(format!("Failed to parse layers JSON: {}", e)))?;
    
    let layers: Vec<ImageLayer> = json_layers.into_iter().map(|json_layer| {
        ImageLayer {
            data: json_layer.data,
            media_type: json_layer.media_type,
            annotations: json_layer.annotations,
        }
    }).collect();

    let json_config: JsonConfig = serde_json::from_str(&config_json)
        .map_err(|e| Error::from_reason(format!("Failed to parse config JSON: {}", e)))?;
    
    let config = Config {
        data: json_config.data,
        media_type: json_config.media_type,
        annotations: json_config.annotations,
    };

    let manifest: Option<OciImageManifest> = if let Some(m_json) = manifest_json {
        Some(serde_json::from_str(&m_json)
            .map_err(|e| Error::from_reason(format!("Failed to parse manifest JSON: {}", e)))?)
    } else {
        None
    };

    let push_response: PushResponse = self.inner.push(&reference, &layers, config, &auth, manifest)
        .await
        .map_err(|e| Error::from_reason(format!("Failed to push image: {}", e)))?;
    
    Ok(NapiPushResponse {
        config_url: push_response.config_url,
        manifest_url: push_response.manifest_url,
    })
  }
}
