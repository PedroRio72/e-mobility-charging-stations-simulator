import { isNotEmptyString, logger } from '../utils/index.js'

const moduleName = 'TemplateMigrations'

/**
 * Single authoritative location for the current template schema version.
 * Concurrent bumps force git merge conflict.
 */
export const CURRENT_SCHEMA_VERSION = 1

type MigrationFn = (template: Record<string, unknown>) => Record<string, unknown>

/**
 * Registry mapping source schema versions to direct-to-latest migration functions.
 * Each migration jumps from its source version straight to CURRENT_SCHEMA_VERSION.
 */
const migrations: ReadonlyMap<number, MigrationFn> = new Map<number, MigrationFn>([
  [0, migrateV0ToV1],
])

/**
 * Coerces a raw `$schemaVersion` value to a valid integer.
 *
 * - Missing → 0 (triggers v0→v1 migration for legacy unversioned templates)
 * - String "1" → number 1
 * - Negative, float, or future → throws
 * @param raw
 */
export const coerceVersion = (raw: unknown): number => {
  if (raw == null) {
    return 0
  }
  const version = typeof raw === 'string' ? Number(raw) : raw
  if (typeof version !== 'number' || !Number.isInteger(version)) {
    throw new Error(
      `Invalid $schemaVersion: expected integer, got ${typeof raw === 'string' ? `"${raw}"` : JSON.stringify(raw)}`
    )
  }
  if (version < 0) {
    throw new Error(`Invalid $schemaVersion: ${version.toString()} is negative`)
  }
  if (version > CURRENT_SCHEMA_VERSION) {
    throw new Error(
      `$schemaVersion ${version.toString()} is newer than supported version ${CURRENT_SCHEMA_VERSION.toString()}. Update the simulator to handle this template`
    )
  }
  return version
}

/**
 * Applies migration from the given source version to CURRENT_SCHEMA_VERSION.
 * Returns the template unchanged if already at current version.
 * @param version
 * @param template
 * @param filePath
 */
export const applyMigration = (
  version: number,
  template: Record<string, unknown>,
  filePath?: string
): Record<string, unknown> => {
  if (version >= CURRENT_SCHEMA_VERSION) {
    return template
  }
  const migrationFn = migrations.get(version)
  if (migrationFn == null) {
    throw new Error(
      `No migration registered for $schemaVersion ${version.toString()} → ${CURRENT_SCHEMA_VERSION.toString()}`
    )
  }
  logger.debug(
    `${moduleName}.applyMigration: Migrating template${filePath != null ? ` '${filePath}'` : ''} from schema version ${version.toString()} to ${CURRENT_SCHEMA_VERSION.toString()}`
  )
  const migrated = migrationFn(template)
  migrated.$schemaVersion = CURRENT_SCHEMA_VERSION
  return migrated
}

/**
 * Deprecated key renames — replaces warnTemplateKeysDeprecation().
 *
 * Renames:
 * - supervisionUrl → supervisionUrls
 * - authorizationFile → idTagsFile
 * - payloadSchemaValidation → ocppStrictCompliance
 * - mustAuthorizeAtRemoteStart → remoteAuthorization
 * @param template
 */
function migrateV0ToV1 (template: Record<string, unknown>): Record<string, unknown> {
  const renames: readonly { deprecatedKey: string; key: string }[] = [
    { deprecatedKey: 'supervisionUrl', key: 'supervisionUrls' },
    { deprecatedKey: 'authorizationFile', key: 'idTagsFile' },
    { deprecatedKey: 'payloadSchemaValidation', key: 'ocppStrictCompliance' },
    { deprecatedKey: 'mustAuthorizeAtRemoteStart', key: 'remoteAuthorization' },
  ]
  const result = { ...template }
  for (const { deprecatedKey, key } of renames) {
    if (result[deprecatedKey] != null) {
      logger.warn(
        `${moduleName}.migrateV0ToV1: Deprecated template key '${deprecatedKey}' found.${isNotEmptyString(key) ? ` Renaming to '${key}'` : ''}`
      )
      result[key] = result[deprecatedKey]
      // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
      delete result[deprecatedKey]
    }
  }
  return result
}
