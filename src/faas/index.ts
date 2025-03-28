import { ir } from '@faasit/core'
import { z } from 'zod'
import { runtime } from '@faasit/core'
import path from 'path';

export type ObjectValue = ir.Types.ObjectValue;
export type TypeCallValue = ir.Types.TypeCallValue;

export interface GeneratorPluginContext { }

export interface GenerationItem {
  path: string
  content: string
  contentType: string
}

export interface GenerationResult {
  items: GenerationItem[]
}

export interface GeneratorPlugin {
  name: string
  generate?: (
    input: { app: Application; irSpec: ir.Spec },
    ctx: GeneratorPluginContext
  ) => Promise<GenerationResult>
}

export type EnvironmentVars = Record<string, string | undefined>

export interface ProviderPluginContext {
  cwd: string
  rt: runtime.PluginRuntime
  logger: runtime.PluginLogger
  env: EnvironmentVars
}

export interface ProviderDeployInput {
  app: Application
  // used to dynamic set different provider
  provider: Provider
}

export interface ProviderInvokeInput {
  app: Application
  funcName: string
  input: unknown
  provider: Provider
}

export interface ProviderBuildInput {
  app: Application
  provider: Provider
  registry?: string
}

export interface ProviderPlugin {
  name: string

  deploy?: (
    input: ProviderDeployInput,
    ctx: ProviderPluginContext
  ) => Promise<void>

  invoke?: (
    input: ProviderInvokeInput,
    ctx: ProviderPluginContext
  ) => Promise<void>

  build?: (
    input: ProviderBuildInput,
    ctx: ProviderPluginContext
  ) => Promise<void>
}

export const EventSchema = ir.types.CustomBlockSchemaT(z.object({
  type: z.string(),
  data: ir.types.StructLikeTypeSchema,
}))

export type Event = z.infer<typeof EventSchema>

const ProviderSchema = ir.types.CustomBlockSchemaWithExtraT(z.object({
  kind: z.string(),
  oss: z.object({
    bucket: z.string(),
    region: z.string(),
  }).optional(),
  deployment: z.object({
    runtimeClass: z.string().optional(),
    startMode: z.string().optional()
  }).optional(),
  invoke: z.record(z.string(),z.string()).optional(),
  registry: z.string().optional(),
  redis_data: z.string().optional()
}))

const FunctionTriggerSchema = z.object({
  name: z.string(),
  kind: z.string(),
})

const FunctionSchema = ir.types.CustomBlockSchemaT(z.object({
  runtime: z.string(),
  image: z.string().optional(),
  baseImage: z.string().optional(),
  codeDir: z.string().default(""),
  handler: z.string().optional(),
  replicas: z.number().optional(),
  resource: z.object({
    cpu: z.number().optional(),
    memory: z.number().optional(),
  }).optional(),
  triggers: z.array(FunctionTriggerSchema).default(() => []),
  pubsub: z.object({
    events: z.array(ir.types.ReferenceSchemaT(EventSchema)),
  }).optional(),
  role: z.string().optional(),
}))

const WorkflowSchema = ir.types.CustomBlockSchemaT(z.object({
  functions: z.array(ir.types.ReferenceSchemaT(FunctionSchema)),

  // workflow spec runtime and codeDir
  runtime: z.string(),
  image: z.string().optional(),
  baseImage: z.string().optional(),
  codeDir: z.string(),
  handler: z.string().optional(),
  replicas: z.number().optional(),
  resource: z.object({
    cpu: z.number().optional(),
    memory: z.number().optional(),
  }).optional(),
  role: z.string().optional(),
}))

const ApplicationSchema = ir.types.CustomBlockSchemaT(z.object({
  name: z.string().optional(),
  defaultProvider: ir.types.ReferenceSchemaT(ProviderSchema),
  providers: z.array(ir.types.ReferenceSchemaT(ProviderSchema)).default(() => []),
  functions: z.array(ir.types.ReferenceSchemaT(FunctionSchema)).default(() => []),
  workflow: ir.types.ReferenceSchemaT(WorkflowSchema).optional(),
  inputExamples: z.array(z.object({
    value: z.unknown()
  })).default(() => []),
  opts: z.record(z.string(),z.string()).optional()
}))

const SecretSchema = ir.types.CustomBlockSchemaT(z.object({
  name: z.string(),
  value: z.string(),
}))

export type Workflow = z.output<typeof WorkflowSchema>
export type Provider = z.output<typeof ProviderSchema>
export type Application = z.output<typeof ApplicationSchema>
export type Function = z.output<typeof FunctionSchema>
export type FunctionTrigger = z.output<typeof FunctionTriggerSchema>
export type Secret = z.output<typeof SecretSchema>

// special application
export type WorkflowApplication = Application & { output: { workflow: ir.Types.Reference<Workflow> } }

export function isWorkflowApplication(app: Application): app is WorkflowApplication {
  return app.output.workflow != undefined
}

export function parseApplication(o: unknown): Application {
  return ApplicationSchema.parse(o)
}

export async function resolveApplicationFromIr(opts: {
  ir: ir.Spec
}): Promise<Application> {
  const applicationBlock = opts.ir.packages[0].blocks.find(
    (b) => ir.types.isCustomBlock(b) && b.$ir.block_type.$ir.id === 'application'
  ) as ir.Types.CustomBlock

  if (!applicationBlock) {
    throw new Error(`no @application block`)
  }

  return parseApplication(applicationBlock)
}
