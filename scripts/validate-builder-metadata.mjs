import { BUILDER_METADATA } from "../data/builder-metadata.js";

const BUILDER_CODE_PATTERN = /^0x[a-f0-9]{64}$/;
const ALLOWED_PROFILE_FIELDS = new Set(["name", "links", "source", "verifiedAt"]);
const ALLOWED_LINK_FIELDS = new Set(["website", "x", "telegram", "github", "discord"]);
const errors = [];

for (const [builderCode, metadata] of Object.entries(BUILDER_METADATA)) {
  if (!BUILDER_CODE_PATTERN.test(builderCode)) {
    errors.push(`${builderCode}: key must be a lowercase 32-byte hex builderCode`);
  }

  for (const field of Object.keys(metadata)) {
    if (!ALLOWED_PROFILE_FIELDS.has(field)) {
      errors.push(`${builderCode}: unknown profile field "${field}"`);
    }
  }

  if (typeof metadata.name !== "string" || !metadata.name.trim()) {
    errors.push(`${builderCode}: name must be a non-empty string`);
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(metadata.verifiedAt || "")) {
    errors.push(`${builderCode}: verifiedAt must use YYYY-MM-DD`);
  }

  try {
    const source = new URL(metadata.source);
    if (source.protocol !== "https:") {
      errors.push(`${builderCode}.source: URL must use HTTPS`);
    }
  } catch {
    errors.push(`${builderCode}.source: "${metadata.source}" is not a valid URL`);
  }

  if (!metadata.links || typeof metadata.links !== "object") {
    errors.push(`${builderCode}: links must be an object`);
    continue;
  }

  if (!Object.keys(metadata.links).length) {
    errors.push(`${builderCode}: links must contain at least one official destination`);
  }

  for (const [linkType, value] of Object.entries(metadata.links)) {
    if (!ALLOWED_LINK_FIELDS.has(linkType)) {
      errors.push(`${builderCode}: unknown link type "${linkType}"`);
      continue;
    }

    try {
      const url = new URL(value);
      if (url.protocol !== "https:") {
        errors.push(`${builderCode}.${linkType}: URL must use HTTPS`);
      }
    } catch {
      errors.push(`${builderCode}.${linkType}: "${value}" is not a valid URL`);
    }
  }
}

if (errors.length) {
  console.error(`Builder metadata validation failed:\n- ${errors.join("\n- ")}`);
  process.exitCode = 1;
} else {
  console.log(`Builder metadata valid: ${Object.keys(BUILDER_METADATA).length} profile(s)`);
}
