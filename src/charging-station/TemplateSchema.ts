import { z } from 'zod'

import { AmpereUnits, CurrentType, PowerUnits } from '../types/index.js'

// -----------------------------------------------------------------------
// Sub-schemas
// -----------------------------------------------------------------------

/**
 * MeterValue `value` field: accepts both string and number, normalizes to string.
 * Handles templates like evlink that use numeric values.
 */
const MeterValueValueSchema = z.union([z.string(), z.number()]).pipe(z.coerce.string())

/**
 * Sampled value template schema — used inside Connectors and Evses MeterValues arrays.
 * Matches the SampledValueTemplate type (SampledValue & { fluctuationPercent?, minimumValue? }).
 */
const SampledValueTemplateSchema = z.looseObject({
  context: z.string().optional(),
  fluctuationPercent: z.number().optional(),
  format: z.string().optional(),
  location: z.string().optional(),
  measurand: z.string().optional(),
  minimumValue: z.number().optional(),
  phase: z.string().optional(),
  unit: z.string().optional(),
  value: MeterValueValueSchema.optional(),
})

/**
 * Connector status schema — used inside Connectors record and Evses connectors.
 * Loose object to tolerate additional OCPP fields.
 */
const ConnectorStatusSchema = z.looseObject({
  bootStatus: z.string().optional(),
  maximumPower: z.number().optional(),
  MeterValues: z.array(SampledValueTemplateSchema).optional(),
  type: z.string().optional(),
})

/**
 * EVSE template schema — contains Connectors record and optional MeterValues.
 */
const EvseTemplateSchema = z.looseObject({
  Connectors: z.record(z.string().regex(/^\d+$/), ConnectorStatusSchema),
  MeterValues: z.array(SampledValueTemplateSchema).optional(),
})

/**
 * Configuration key schema — matches ConfigurationKey type.
 */
const ConfigurationKeySchema = z.looseObject({
  key: z.string(),
  readonly: z.boolean(),
  reboot: z.boolean().optional(),
  value: z.string().optional(),
  visible: z.boolean().optional(),
})

/**
 * OCPP configuration schema — matches ChargingStationOcppConfiguration type.
 */
const OcppConfigurationSchema = z.looseObject({
  configurationKey: z.array(ConfigurationKeySchema).optional(),
})

/**
 * Automatic transaction generator configuration schema.
 */
const AutomaticTransactionGeneratorSchema = z.looseObject({
  enable: z.boolean(),
  idTagDistribution: z.string().optional(),
  maxDelayBetweenTwoTransactions: z.number(),
  maxDuration: z.number(),
  minDelayBetweenTwoTransactions: z.number(),
  minDuration: z.number(),
  probabilityOfStart: z.number(),
  requireAuthorize: z.boolean().optional(),
  stopAbsoluteDuration: z.boolean().optional(),
  stopAfterHours: z.number(),
})

/**
 * Firmware upgrade schema — matches FirmwareUpgrade type.
 */
const FirmwareUpgradeSchema = z.looseObject({
  failureStatus: z.string().optional(),
  reset: z.boolean().optional(),
  versionUpgrade: z
    .looseObject({
      patternGroup: z.number().optional(),
      step: z.number().optional(),
    })
    .optional(),
})

/**
 * Commands support schema — matches CommandsSupport type.
 */
const CommandsSupportSchema = z.looseObject({
  incomingCommands: z.record(z.string(), z.boolean()),
  outgoingCommands: z.record(z.string(), z.boolean()).optional(),
})

// -----------------------------------------------------------------------
// Top-level template schema (loose — tolerates unknown keys)
// -----------------------------------------------------------------------

/**
 * Connectors record: numeric string keys as required by OCPP.
 */
const ConnectorsSchema = z.record(z.string().regex(/^\d+$/), ConnectorStatusSchema)

/**
 * Evses record: numeric string keys.
 */
const EvsesSchema = z.record(z.string().regex(/^\d+$/), EvseTemplateSchema)

/**
 * Common template fields shared by loose and strict schemas.
 * Uses `z.enum()` for string-valued enums (AmpereUnits, CurrentType, PowerUnits)
 * and `z.number()` for voltageOut (templates use values outside the Voltage enum).
 *
 * No `.default()` on config fields — would break the 4-layer `mergeDeepRight` precedence chain.
 * Only `$schemaVersion` gets `.default(1)` as it is metadata, not part of merge chain.
 */
const templateFields = {
  $schemaVersion: z.number().int().min(1).default(1),
  amperageLimitationOcppKey: z.string().optional(),
  amperageLimitationUnit: z.enum(AmpereUnits).optional(),
  AutomaticTransactionGenerator: AutomaticTransactionGeneratorSchema.optional(),
  automaticTransactionGeneratorPersistentConfiguration: z.boolean().optional(),
  autoReconnectMaxRetries: z.number().optional(),
  autoRegister: z.boolean().optional(),
  autoStart: z.boolean().optional(),
  baseName: z.string().min(1),
  beginEndMeterValues: z.boolean().optional(),
  chargeBoxSerialNumberPrefix: z.string().optional(),
  chargePointModel: z.string().min(1),
  chargePointSerialNumberPrefix: z.string().optional(),
  chargePointVendor: z.string().min(1),
  commandsSupport: CommandsSupportSchema.optional(),
  Configuration: OcppConfigurationSchema.optional(),
  Connectors: ConnectorsSchema.optional(),
  currentOutType: z.enum(CurrentType).optional(),
  customValueLimitationMeterValues: z.boolean().optional(),
  enableStatistics: z.boolean().optional(),
  Evses: EvsesSchema.optional(),
  firmwareUpgrade: FirmwareUpgradeSchema.optional(),
  firmwareVersion: z.string().optional(),
  firmwareVersionPattern: z.string().optional(),
  fixedName: z.boolean().optional(),
  iccid: z.string().optional(),
  idTagsFile: z.string().optional(),
  imsi: z.string().optional(),
  mainVoltageMeterValues: z.boolean().optional(),
  messageTriggerSupport: z.record(z.string(), z.boolean()).optional(),
  meteringPerTransaction: z.boolean().optional(),
  meterSerialNumberPrefix: z.string().optional(),
  meterType: z.string().optional(),
  nameSuffix: z.string().optional(),
  numberOfConnectors: z.union([z.number(), z.array(z.number())]).optional(),
  numberOfPhases: z.number().optional(),
  ocppPersistentConfiguration: z.boolean().optional(),
  ocppProtocol: z.string().optional(),
  ocppStrictCompliance: z.boolean().optional(),
  ocppVersion: z.string().optional(),
  outOfOrderEndMeterValues: z.boolean().optional(),
  phaseLineToLineVoltageMeterValues: z.boolean().optional(),
  postTransactionDelay: z.number().optional(),
  power: z.union([z.number(), z.array(z.number())]).optional(),
  powerSharedByConnectors: z.boolean().optional(),
  powerUnit: z.enum(PowerUnits).optional(),
  randomConnectors: z.boolean().optional(),
  reconnectExponentialDelay: z.boolean().optional(),
  registrationMaxRetries: z.number().optional(),
  remoteAuthorization: z.boolean().optional(),
  resetTime: z.number().optional(),
  stationInfoPersistentConfiguration: z.boolean().optional(),
  stopTransactionsOnStopped: z.boolean().optional(),
  supervisionPassword: z.string().optional(),
  supervisionUrlOcppConfiguration: z.boolean().optional(),
  supervisionUrlOcppKey: z.string().optional(),
  supervisionUrls: z.union([z.string(), z.array(z.string())]).optional(),
  supervisionUser: z.string().optional(),
  templateHash: z.string().optional(),
  transactionDataMeterValues: z.boolean().optional(),
  useConnectorId0: z.boolean().optional(),
  voltageOut: z.number().optional(),
  wsOptions: z.record(z.string(), z.unknown()).optional(),
  x509Certificates: z.record(z.string(), z.string()).optional(),
} as const

/**
 * SuperRefine handler for topology constraint and EVSE validation.
 * @param val
 * @param ctx
 */
const topologyRefinement = (val: Record<string, unknown>, ctx: z.RefinementCtx): void => {
  const hasConnectors = val.Connectors != null
  const hasEvses = val.Evses != null
  if (!hasConnectors && !hasEvses) {
    ctx.addIssue({
      code: 'custom',
      message: 'Template must define Connectors or Evses',
    })
    return
  }
  if (hasConnectors && hasEvses) {
    ctx.addIssue({
      code: 'custom',
      message: 'Template must define Connectors OR Evses, not both',
    })
    return
  }
  // EVSE connector ID validation (OCPP 2.0.1 §7.2)
  if (hasEvses) {
    const evses = val.Evses as Record<string, { Connectors: Record<string, unknown> }>
    for (const evseKey of Object.keys(evses)) {
      const evseId = Number(evseKey)
      const connectorIds = Object.keys(evses[evseKey].Connectors).map(Number)
      if (evseId === 0) {
        for (const connectorId of connectorIds) {
          if (connectorId !== 0) {
            ctx.addIssue({
              code: 'custom',
              message: `EVSE 0 has invalid connector id ${connectorId.toString()}, only connector id 0 is allowed (OCPP 2.0.1 §7.2)`,
              path: ['Evses', evseKey, 'Connectors', connectorId.toString()],
            })
          }
        }
      } else if (evseId > 0) {
        for (const connectorId of connectorIds) {
          if (connectorId < 1) {
            ctx.addIssue({
              code: 'custom',
              message: `EVSE ${evseId.toString()} has invalid connector id ${connectorId.toString()}, connector ids must start at 1 (OCPP 2.0.1 §7.2)`,
              path: ['Evses', evseKey, 'Connectors', connectorId.toString()],
            })
          }
        }
      }
    }
  }
}

/**
 * Loose template schema with topology constraint and EVSE validation.
 * Used for runtime validation at template parse time.
 */
export const TemplateSchema = z.looseObject(templateFields).superRefine(topologyRefinement)

/**
 * Strict template schema variant for CI validation.
 * Rejects unrecognized keys.
 */
export const StrictTemplateSchema = z.strictObject(templateFields).superRefine(topologyRefinement)

// -----------------------------------------------------------------------
// Compile-time drift detection
// -----------------------------------------------------------------------
// Verifies that schema output keys are a superset of ChargingStationTemplate keys.
// Direct assignability check is not possible because:
// - looseObject adds `[x: string]: unknown` index signature
// - Some enum-typed fields (IdTagDistribution, OCPPProtocol, OCPPVersion) use
//   z.string() in the schema since templates may contain valid future values
// - voltageOut uses z.number() (templates have values outside Voltage enum)
// - wsOptions uses z.record (WsOptions = ClientOptions & ClientRequestArgs is too complex)
//
// The validateTemplate() pipeline casts the validated output through `as unknown as`
// to bridge these known divergences. If a NEW required field is added to
// ChargingStationTemplate but not to the schema, tests will catch the gap at runtime.
export type TemplateSchemaOutput = z.infer<typeof TemplateSchema>
