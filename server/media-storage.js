const value = (name) => String(process.env[name] || "").trim();

export function getMediaStorageConfig() {
  const endpoint = value("CLIPFORGE_S3_ENDPOINT");
  const bucket = value("CLIPFORGE_S3_BUCKET");
  const accessKey = value("CLIPFORGE_S3_ACCESS_KEY_ID");
  const secretKey = value("CLIPFORGE_S3_SECRET_ACCESS_KEY");

  const objectStorageConfigured = Boolean(endpoint && bucket && accessKey && secretKey);
  return {
    mode: objectStorageConfigured ? "s3-compatible" : "local",
    persistent: objectStorageConfigured,
    endpointConfigured: Boolean(endpoint),
    bucketConfigured: Boolean(bucket),
    credentialsConfigured: Boolean(accessKey && secretKey),
  };
}
