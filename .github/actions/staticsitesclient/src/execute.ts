import * as exec from '@actions/exec'

export async function Execute(tool: string): Promise<void> {
  await exec.getExecOutput(tool)
}
