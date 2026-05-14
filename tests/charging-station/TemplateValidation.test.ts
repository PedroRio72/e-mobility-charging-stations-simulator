/**
 * @file Tests for TemplateValidation
 * @description Unit tests for the charging station template Zod validation pipeline,
 * schema versioning, migrations, and error handling
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { afterEach, describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'

import {
  coerceVersion,
  CURRENT_SCHEMA_VERSION,
} from '../../src/charging-station/TemplateMigrations.js'
import { StrictTemplateSchema, TemplateSchema } from '../../src/charging-station/TemplateSchema.js'
import {
  TemplateValidationError,
  validateTemplate,
} from '../../src/charging-station/TemplateValidation.js'
import { logger } from '../../src/utils/index.js'
import { standardCleanup } from '../helpers/TestLifecycleHelpers.js'

const TEMPLATES_DIR = resolve(
  join(fileURLToPath(import.meta.url), '..', '..', '..', 'src', 'assets', 'station-templates')
)

const TEMPLATE_FILES = [
  'abb-atg.station-template.json',
  'abb.station-template.json',
  'chargex.station-template.json',
  'evlink.station-template.json',
  'keba-ocpp2-signed.station-template.json',
  'keba-ocpp2.station-template.json',
  'keba.station-template.json',
  'schneider-evses.station-template.json',
  'schneider-imredd.station-template.json',
  'schneider.station-template.json',
  'siemens.station-template.json',
  'virtual-simple-atg.station-template.json',
  'virtual-simple-signed.station-template.json',
  'virtual-simple.station-template.json',
  'virtual.station-template.json',
]

/**
 * Minimal valid template for testing (Connectors variant)
 * @param overrides
 */
const createMinimalTemplate = (overrides?: Record<string, unknown>): Record<string, unknown> => ({
  $schemaVersion: 1,
  baseName: 'CS-TEST',
  chargePointModel: 'TestModel',
  chargePointVendor: 'TestVendor',
  Connectors: {
    0: {},
    1: {},
  },
  ...overrides,
})

await describe('TemplateValidation', async () => {
  afterEach(() => {
    standardCleanup()
  })

  // -------------------------------------------------------------------
  // Fixture matrix — all 15 templates pass validation
  // -------------------------------------------------------------------
  await describe('fixture matrix', async () => {
    for (const templateFile of TEMPLATE_FILES) {
      await it(`should validate ${templateFile}`, () => {
        // Arrange
        const filePath = join(TEMPLATES_DIR, templateFile)
        const rawJson = readFileSync(filePath, 'utf8')
        const parsed = JSON.parse(rawJson) as Record<string, unknown>

        // Act
        const result = validateTemplate(parsed, filePath)

        // Assert
        assert.ok(result)
        assert.strictEqual(typeof result.baseName, 'string')
        assert.strictEqual(typeof result.chargePointModel, 'string')
        assert.strictEqual(typeof result.chargePointVendor, 'string')
        assert.ok(result.Connectors !== undefined || result.Evses !== undefined)
      })
    }
  })

  // -------------------------------------------------------------------
  // CI strict mode — all 15 templates pass strict validation
  // -------------------------------------------------------------------
  await describe('CI strict mode', async () => {
    for (const templateFile of TEMPLATE_FILES) {
      await it(`should pass strict validation for ${templateFile}`, () => {
        // Arrange
        const filePath = join(TEMPLATES_DIR, templateFile)
        const rawJson = readFileSync(filePath, 'utf8')
        const parsed = JSON.parse(rawJson) as Record<string, unknown>

        // Act
        const result = StrictTemplateSchema.safeParse(parsed)

        // Assert
        assert.strictEqual(result.success, true)
      })
    }
  })

  // -------------------------------------------------------------------
  // Invalid fixtures
  // -------------------------------------------------------------------
  await describe('invalid templates', async () => {
    await it('should reject empty object', () => {
      assert.throws(
        () => {
          validateTemplate({}, 'empty.json')
        },
        (error: unknown) => error instanceof TemplateValidationError
      )
    })

    await it('should reject template missing baseName', () => {
      assert.throws(
        () => {
          validateTemplate(
            {
              $schemaVersion: 1,
              chargePointModel: 'M',
              chargePointVendor: 'V',
              Connectors: { 0: {} },
            },
            'missing-baseName.json'
          )
        },
        (error: unknown) => error instanceof TemplateValidationError
      )
    })

    await it('should reject template with neither Connectors nor Evses', () => {
      assert.throws(
        () => {
          validateTemplate(
            {
              $schemaVersion: 1,
              baseName: 'CS-TEST',
              chargePointModel: 'M',
              chargePointVendor: 'V',
            },
            'no-topology.json'
          )
        },
        (error: unknown) => {
          if (!(error instanceof TemplateValidationError)) return false
          return error.fieldErrors.some(e =>
            e.message.includes('Template must define Connectors or Evses')
          )
        }
      )
    })

    await it('should reject template with both Connectors and Evses', () => {
      assert.throws(
        () => {
          validateTemplate(
            {
              $schemaVersion: 1,
              baseName: 'CS-TEST',
              chargePointModel: 'M',
              chargePointVendor: 'V',
              Connectors: { 0: {} },
              Evses: { 0: { Connectors: { 0: {} } } },
            },
            'both-topology.json'
          )
        },
        (error: unknown) => {
          if (!(error instanceof TemplateValidationError)) return false
          return error.fieldErrors.some(e =>
            e.message.includes('Template must define Connectors OR Evses, not both')
          )
        }
      )
    })

    await it('should reject EVSE 0 with non-zero connector ids', () => {
      assert.throws(
        () => {
          validateTemplate(
            {
              $schemaVersion: 1,
              baseName: 'CS-TEST',
              chargePointModel: 'M',
              chargePointVendor: 'V',
              Evses: {
                0: { Connectors: { 1: {} } },
                1: { Connectors: { 1: {} } },
              },
            },
            'bad-evse0.json'
          )
        },
        (error: unknown) => {
          if (!(error instanceof TemplateValidationError)) return false
          return error.fieldErrors.some(e =>
            e.message.includes('EVSE 0 has invalid connector id 1')
          )
        }
      )
    })

    await it('should reject EVSE >0 with connector id 0', () => {
      assert.throws(
        () => {
          validateTemplate(
            {
              $schemaVersion: 1,
              baseName: 'CS-TEST',
              chargePointModel: 'M',
              chargePointVendor: 'V',
              Evses: {
                0: { Connectors: { 0: {} } },
                1: { Connectors: { 0: {} } },
              },
            },
            'bad-evse1.json'
          )
        },
        (error: unknown) => {
          if (!(error instanceof TemplateValidationError)) return false
          return error.fieldErrors.some(e => e.message.includes('connector ids must start at 1'))
        }
      )
    })

    await it('should reject invalid baseName type', () => {
      assert.throws(
        () => {
          validateTemplate(
            {
              $schemaVersion: 1,
              baseName: 123,
              chargePointModel: 'M',
              chargePointVendor: 'V',
              Connectors: { 0: {} },
            },
            'bad-baseName.json'
          )
        },
        (error: unknown) => error instanceof TemplateValidationError
      )
    })
  })

  // -------------------------------------------------------------------
  // Version gate
  // -------------------------------------------------------------------
  await describe('version gate', async () => {
    await it('should accept missing $schemaVersion (treated as v0, migrated to v1)', t => {
      // Arrange
      t.mock.method(logger, 'debug')
      const template = createMinimalTemplate()
      delete template.$schemaVersion

      // Act
      const result = validateTemplate(template, 'no-version.json')

      // Assert
      assert.ok(result)
    })

    await it('should accept string version "1"', () => {
      // Arrange
      const template = createMinimalTemplate({ $schemaVersion: '1' })

      // Act — coerceVersion handles string
      const version = coerceVersion(template.$schemaVersion)

      // Assert
      assert.strictEqual(version, 1)
    })

    await it('should reject negative version', () => {
      assert.throws(
        () => {
          coerceVersion(-1)
        },
        { message: /negative/ }
      )
    })

    await it('should reject float version', () => {
      assert.throws(
        () => {
          coerceVersion(1.5)
        },
        { message: /expected integer/ }
      )
    })

    await it('should reject future version', () => {
      assert.throws(
        () => {
          coerceVersion(CURRENT_SCHEMA_VERSION + 1)
        },
        { message: /newer than supported/ }
      )
    })

    await it('should accept current version', () => {
      const version = coerceVersion(CURRENT_SCHEMA_VERSION)
      assert.strictEqual(version, CURRENT_SCHEMA_VERSION)
    })
  })

  // -------------------------------------------------------------------
  // Migration (v0 → v1 deprecated key renames)
  // -------------------------------------------------------------------
  await describe('migration', async () => {
    await it('should migrate deprecated keys from v0 to v1', t => {
      // Arrange
      const warnMock = t.mock.method(logger, 'warn')
      const template = {
        $schemaVersion: 0,
        authorizationFile: 'auth.json',
        baseName: 'CS-OLD',
        chargePointModel: 'M',
        chargePointVendor: 'V',
        Connectors: { 0: {} },
        mustAuthorizeAtRemoteStart: false,
        payloadSchemaValidation: true,
        supervisionUrl: 'ws://localhost:9000',
      }

      // Act
      const result = validateTemplate(template, 'v0-template.json')

      // Assert — deprecated keys renamed
      assert.strictEqual(result.supervisionUrls, 'ws://localhost:9000')
      assert.strictEqual(result.idTagsFile, 'auth.json')
      assert.strictEqual(result.ocppStrictCompliance, true)
      assert.strictEqual(result.remoteAuthorization, false)
      // Old keys should not exist
      assert.strictEqual((result as unknown as Record<string, unknown>).supervisionUrl, undefined)
      assert.strictEqual(
        (result as unknown as Record<string, unknown>).authorizationFile,
        undefined
      )
      assert.strictEqual(
        (result as unknown as Record<string, unknown>).payloadSchemaValidation,
        undefined
      )
      assert.strictEqual(
        (result as unknown as Record<string, unknown>).mustAuthorizeAtRemoteStart,
        undefined
      )
      // Migration should have logged warnings
      assert.ok(warnMock.mock.calls.length >= 4)
    })

    await it('should migrate unversioned templates with deprecated keys (regression)', t => {
      // Arrange — no $schemaVersion field; uses deprecated keys
      const warnMock = t.mock.method(logger, 'warn')
      t.mock.method(logger, 'debug')
      const template = {
        authorizationFile: 'tags.json',
        baseName: 'CS-LEGACY',
        chargePointModel: 'LegacyModel',
        chargePointVendor: 'LegacyVendor',
        Connectors: { 0: {}, 1: {} },
        supervisionUrl: 'ws://legacy:9000',
      }

      // Act
      const result = validateTemplate(template, 'unversioned-legacy.json')

      // Assert — deprecated keys renamed
      assert.strictEqual(result.supervisionUrls, 'ws://legacy:9000')
      assert.strictEqual(result.idTagsFile, 'tags.json')
      // Old keys should not exist
      assert.strictEqual((result as unknown as Record<string, unknown>).supervisionUrl, undefined)
      assert.strictEqual(
        (result as unknown as Record<string, unknown>).authorizationFile,
        undefined
      )
      // Migration should have logged warnings for deprecated keys
      assert.ok(warnMock.mock.calls.length >= 2)
    })
  })

  // -------------------------------------------------------------------
  // Round-trip (validate → serialize → re-validate = identical)
  // -------------------------------------------------------------------
  await describe('round-trip', async () => {
    for (const templateFile of TEMPLATE_FILES) {
      await it(`should produce identical result on re-validation for ${templateFile}`, t => {
        // Suppress idTagsFile warning noise
        t.mock.method(logger, 'warn')

        // Arrange
        const filePath = join(TEMPLATES_DIR, templateFile)
        const rawJson = readFileSync(filePath, 'utf8')
        const parsed = JSON.parse(rawJson) as Record<string, unknown>

        // Act
        const first = validateTemplate(parsed, filePath)
        const serialized = JSON.parse(JSON.stringify(first)) as Record<string, unknown>
        const second = validateTemplate(serialized, filePath)

        // Assert
        assert.deepStrictEqual(first, second)
      })
    }
  })

  // -------------------------------------------------------------------
  // Error messages
  // -------------------------------------------------------------------
  await describe('error messages', async () => {
    await it('should include file path in error', () => {
      try {
        validateTemplate({}, 'my/template.json')
        assert.fail('Expected TemplateValidationError')
      } catch (error) {
        assert.ok(error instanceof TemplateValidationError)
        assert.strictEqual(error.filePath, 'my/template.json')
        assert.ok(error.message.includes('my/template.json'))
      }
    })

    await it('should include field paths in error', () => {
      try {
        validateTemplate(
          {
            $schemaVersion: 1,
            baseName: '', // too short
            chargePointModel: 'M',
            chargePointVendor: 'V',
            Connectors: { 0: {} },
          },
          'bad-fields.json'
        )
        assert.fail('Expected TemplateValidationError')
      } catch (error) {
        assert.ok(error instanceof TemplateValidationError)
        assert.ok(error.fieldErrors.length > 0)
        assert.ok(error.fieldErrors.some(e => e.path.includes('baseName')))
      }
    })

    await it('should include migratedFrom when migrating', t => {
      // Arrange
      t.mock.method(logger, 'warn')
      const template = {
        $schemaVersion: 0,
        baseName: '', // invalid
        chargePointModel: 'M',
        chargePointVendor: 'V',
        Connectors: { 0: {} },
      }

      // Act & Assert
      try {
        validateTemplate(template, 'migrated-invalid.json')
        assert.fail('Expected TemplateValidationError')
      } catch (error) {
        assert.ok(error instanceof TemplateValidationError)
        assert.strictEqual(error.migratedFrom, 0)
      }
    })
  })

  // -------------------------------------------------------------------
  // MeterValues value normalization
  // -------------------------------------------------------------------
  await describe('MeterValues value normalization', async () => {
    await it('should coerce numeric MeterValues value to string', t => {
      // Suppress idTagsFile warning
      t.mock.method(logger, 'warn')

      // Arrange
      const template = createMinimalTemplate({
        Connectors: {
          0: {},
          1: {
            MeterValues: [{ unit: 'Wh', value: 0 }],
          },
        },
        idTagsFile: 'idtags.json',
      })

      // Act
      const result = validateTemplate(template, 'meter-value-number.json')

      // Assert
      const connectors = result.Connectors as Record<string, { MeterValues?: { value?: string }[] }>
      assert.strictEqual(connectors['1'].MeterValues?.[0].value, '0')
    })

    await it('should preserve string MeterValues value', t => {
      // Suppress idTagsFile warning
      t.mock.method(logger, 'warn')

      // Arrange
      const template = createMinimalTemplate({
        Connectors: {
          0: {},
          1: {
            MeterValues: [{ unit: 'Wh', value: '42.5' }],
          },
        },
        idTagsFile: 'idtags.json',
      })

      // Act
      const result = validateTemplate(template, 'meter-value-string.json')

      // Assert
      const connectors = result.Connectors as Record<string, { MeterValues?: { value?: string }[] }>
      assert.strictEqual(connectors['1'].MeterValues?.[0].value, '42.5')
    })
  })

  // -------------------------------------------------------------------
  // Transform — randomConnectors forcing
  // -------------------------------------------------------------------
  await describe('transform', async () => {
    await it('should force randomConnectors when numberOfConnectors exceeds configured', t => {
      // Suppress idTagsFile warning
      t.mock.method(logger, 'warn')

      // Arrange — 5 connectors but only 1 configured (plus connector 0)
      const template = createMinimalTemplate({
        Connectors: {
          0: {},
          1: {},
        },
        idTagsFile: 'idtags.json',
        numberOfConnectors: 5,
        randomConnectors: false,
      })

      // Act
      const result = validateTemplate(template, 'random-connectors.json')

      // Assert
      assert.strictEqual(result.randomConnectors, true)
    })

    await it('should not force randomConnectors when count is within range', t => {
      // Suppress idTagsFile warning
      t.mock.method(logger, 'warn')

      // Arrange
      const template = createMinimalTemplate({
        Connectors: {
          0: {},
          1: {},
        },
        idTagsFile: 'idtags.json',
        numberOfConnectors: 1,
        randomConnectors: false,
      })

      // Act
      const result = validateTemplate(template, 'no-random.json')

      // Assert
      assert.strictEqual(result.randomConnectors, false)
    })

    await it('should warn about missing idTagsFile', t => {
      // Arrange
      const warnMock = t.mock.method(logger, 'warn')
      const template = createMinimalTemplate()

      // Act
      validateTemplate(template, 'no-idtags.json')

      // Assert
      assert.ok(
        warnMock.mock.calls.some(call =>
          JSON.stringify(call.arguments).includes('Missing id tags file')
        )
      )
    })
  })

  // -------------------------------------------------------------------
  // Schema version constant
  // -------------------------------------------------------------------
  await it('should have CURRENT_SCHEMA_VERSION equal to 1', () => {
    assert.strictEqual(CURRENT_SCHEMA_VERSION, 1)
  })

  // -------------------------------------------------------------------
  // TemplateSchema exports
  // -------------------------------------------------------------------
  await it('should export TemplateSchema and StrictTemplateSchema', () => {
    assert.ok(TemplateSchema)
    assert.ok(StrictTemplateSchema)
    assert.strictEqual(typeof TemplateSchema.safeParse, 'function')
    assert.strictEqual(typeof StrictTemplateSchema.safeParse, 'function')
  })
})
