import * as core from '@actions/core'
import { ISourceInputs } from './source-inputs'

export async function getInputs(): Promise<ISourceInputs> {
  const result = {} as unknown as ISourceInputs

  result.version = core.getInput('version', { required: false }).toLowerCase() || 'stable'
  result.execute = getBooleanInput('execute', { required: false })

  return result
}

// overrides the default core.getBooleanInput() to support empty string as false - for testing
// https://github.com/actions/toolkit/blob/main/packages/core/src/core.ts#L173
function getBooleanInput(name: string, options?: core.InputOptions): boolean {
  const trueValue = ['true', 'True', 'TRUE', '1']
  const val = trueValue.includes(core.getInput(name, options)) ? 'true' : 'false'

  return core.getBooleanInput(val, options)
}
