import type { z } from 'zod'

import type { ChargingStationTemplate } from '../types/index.js'

import { BaseError } from '../exception/index.js'
import { isEmpty, logger } from '../utils/index.js'
import { applyMigration, coerceVersion, CURRENT_SCHEMA_VERSION } from './TemplateMigrations.js'
import { TemplateSchema } from './TemplateSchema.js'

const moduleName = 'TemplateValidation'

interface FieldError {
  message: string
  path: string
}

/**
 * Error thrown when a charging station template fails Zod validation.
 * Provides structured field-level error details for diagnostics.
 */
export class TemplateValidationError extends BaseError {
  public readonly fieldErrors: readonly FieldError[]
  public readonly filePath: string
  public readonly migratedFrom?: number

  public constructor (zodError: z.ZodError, context: { filePath: string; migratedFrom?: number }) {
    const fieldErrors: FieldError[] = zodError.issues.map(issue => ({
      message: issue.message,
      path: issue.path.map(String).join('.'),
    }))
    const fieldSummary = fieldErrors
      .map(e => `  - ${e.path !== '' ? e.path : '(root)'}: ${e.message}`)
      .join('\n')
    super(`Template validation failed for '${context.filePath}':\n${fieldSummary}`)
    this.filePath = context.filePath
    this.fieldErrors = fieldErrors
    this.migratedFrom = context.migratedFrom
  }
}

/**
 * Validates a parsed template object through the Zod schema pipeline:
 * coerceVersion → migrate → validate → transform.
 * @param parsed - Raw parsed JSON object from the template file
 * @param filePath - Template file path (for error messages)
 * @returns Validated and transformed ChargingStationTemplate
 * @throws TemplateValidationError on schema validation failure
 * @throws Error on version coercion or migration failure
 */
export const validateTemplate = (
  parsed: Record<string, unknown>,
  filePath: string
): ChargingStationTemplate => {
  if (isEmpty(parsed)) {
    const errorResult = TemplateSchema.safeParse(parsed)
    if (!errorResult.success) {
      throw new TemplateValidationError(errorResult.error, { filePath })
    }
  }
  const version = coerceVersion(parsed.$schemaVersion)
  const migratedFrom = version < CURRENT_SCHEMA_VERSION ? version : undefined
  const migrated =
    version < CURRENT_SCHEMA_VERSION ? applyMigration(version, parsed, filePath) : parsed
  const result = TemplateSchema.safeParse(migrated)
  if (!result.success) {
    throw new TemplateValidationError(result.error, { filePath, migratedFrom })
  }
  return transformTemplate(result.data, filePath)
}

/**
 * Post-validation transform. Separated from schema because schemas must be pure.
 *
 * - Preserves checkConnectorsConfiguration() randomConnectors mutation
 * - Warns about missing idTagsFile
 * @param validated
 * @param filePath
 */
const transformTemplate = (
  validated: z.infer<typeof TemplateSchema>,
  filePath: string
): ChargingStationTemplate => {
  // Advisory: warn about missing idTagsFile (non-fatal)
  if (validated.idTagsFile == null || validated.idTagsFile === '') {
    logger.warn(
      `${moduleName}.transformTemplate: Missing id tags file in template file ${filePath}. That can lead to issues with the Automatic Transaction Generator`
    )
  }
  // Preserve randomConnectors forcing when connector count > configured
  if (validated.Connectors != null && validated.randomConnectors !== true) {
    const templateMaxConnectors = Object.keys(validated.Connectors).length
    const templateMaxAvailableConnectors =
      '0' in validated.Connectors ? templateMaxConnectors - 1 : templateMaxConnectors
    if (typeof validated.numberOfConnectors === 'number') {
      if (validated.numberOfConnectors > templateMaxAvailableConnectors) {
        logger.warn(
          `${moduleName}.transformTemplate: Number of connectors exceeds the number of connector configurations in template ${filePath}, forcing random connector configurations affectation`
        )
        ;(validated as Record<string, unknown>).randomConnectors = true
      }
    } else if (Array.isArray(validated.numberOfConnectors)) {
      const maxConfigured = Math.max(...validated.numberOfConnectors)
      if (maxConfigured > templateMaxAvailableConnectors) {
        logger.warn(
          `${moduleName}.transformTemplate: Number of connectors exceeds the number of connector configurations in template ${filePath}, forcing random connector configurations affectation`
        )
        ;(validated as Record<string, unknown>).randomConnectors = true
      }
    }
  }
  return validated as unknown as ChargingStationTemplate
}
