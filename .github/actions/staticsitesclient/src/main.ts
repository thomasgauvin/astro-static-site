import * as core from '@actions/core'
import * as inputHelper from './input-helper'
import { Install } from './install'
import { Execute } from './execute'

// https://docs.github.com/en/actions/learn-github-actions/contexts#github-context

export async function main(): Promise<void> {
  try {
    const sourceInputs = await inputHelper.getInputs()
    const tool = await Install(sourceInputs)
    if (sourceInputs.execute === true) {
      await Execute(tool.name)
    }
  } catch (error) {
    if (error instanceof Error) core.setFailed(`${error?.message ?? error}`)
  }
}

main()
