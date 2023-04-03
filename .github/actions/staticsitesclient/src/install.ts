// https://ts.dev/style
import * as os from 'os'
import * as path from 'path'
import { chmodSync } from 'fs'
import * as io from '@actions/io'
import * as core from '@actions/core'
import * as cache from '@actions/cache'
import * as exec from '@actions/exec'
import * as toolCache from '@actions/tool-cache'
import { v4 as uuid } from 'uuid'
import { ISourceInputs } from './source-inputs'
import fetch from 'node-fetch'

// Tool globals
const TOOL_NAME = 'StaticSitesClient'
const TOOL_VERSION_ARG: string[] = ['version']
const TOOL_RELEASE_METADATA = 'https://swalocaldeploy.azureedge.net/downloads/versions.json'

// App globals
const TEMP_DIRECTORY: string = process.env.RUNNER_TEMP || os.tmpdir()
//: Promise<[string, string, string, boolean, string | undefined]>
export async function Install(inputs: ISourceInputs) {
  const releaseMetadata = await getReleaseMetadata(inputs.version)
  const versionMarker = `${releaseMetadata.buildId}-${releaseMetadata.version}`

  const pathToInstall: string = path.join(TEMP_DIRECTORY, `${TOOL_NAME}-${versionMarker}`)
  core.info(`Version to install: ${versionMarker} (target directory: ${pathToInstall})`)
  const cacheKey: string = await getCacheKey(versionMarker)

  const [restoredFromCache]: [boolean, string] | [boolean, undefined] = await tryRestoreFromCache([pathToInstall], cacheKey)

  let downloadUrlHref: string | undefined = undefined
  if (restoredFromCache === false) {
    const [downloadUrl, filename] = await getDownloadUrl(releaseMetadata)
    downloadUrlHref = downloadUrl.href
    const downloadPath: string = await downloadTool(downloadUrl, filename)
    await extractPackage(downloadPath, pathToInstall, filename)
    await trySaveToCache([pathToInstall], cacheKey)
  }

  core.addPath(core.toPlatformPath(pathToInstall))
  const toolVersion: string = await getToolVersion(TOOL_NAME, TOOL_VERSION_ARG)
  core.debug(toolVersion)

  return { name: TOOL_NAME, version: releaseMetadata.version, path: pathToInstall, restoredFromCache, downloadUrl: downloadUrlHref }
}

async function getToolVersion(command: string, args?: string[]): Promise<string> {
  const { stdout } = await exec.getExecOutput(command, args)

  return stdout.trim()
}

async function getLsbRelease(): Promise<string> {
  const { stdout } = await exec.getExecOutput('lsb_release', ['-cs'])

  return stdout.trim()
}

async function getCacheKey(version: string): Promise<string> {
  let cacheKey = `${TOOL_NAME}-${version}-${process.platform}-${process.arch}`
  if (process.platform === 'linux') {
    const lsbRelease: string = await getLsbRelease()
    cacheKey = `${cacheKey}-${lsbRelease}`
  }
  cacheKey = `${cacheKey}-cache`
  core.info(`Cache key: ${cacheKey}`)

  return cacheKey
}

async function extractPackage(downloadPath: string, pathToInstall: string, filename: string): Promise<void> {
  const destinationPath = path.join(pathToInstall, filename)
  await io.mkdirP(pathToInstall)
  await io.cp(downloadPath, destinationPath, { recursive: true, force: true })
  chmodSync(destinationPath, 0o755)
  await io.rmRF(downloadPath)
  core.info(`Extracted ${filename} to ${pathToInstall}`)
}

async function downloadTool(url: URL, filename: string): Promise<string> {
  let downloadPath = ''
  try {
    downloadPath = await toolCache.downloadTool(url.href, path.join(TEMP_DIRECTORY, uuid(), filename))
    core.info(`Downloaded from ${url} to ${downloadPath}`)
  } catch (error) {
    if (error instanceof Error) core.setFailed(new Error(`Could not download ${TOOL_NAME} from ${url}, error: ${error.message}`))
    process.exit()
  }

  return downloadPath
}

async function trySaveToCache(paths: string[], key: string): Promise<number> {
  let cacheId = 0
  try {
    cacheId = await cache.saveCache(paths, key)
    core.info(`${TOOL_NAME} saved to cache (cacheId: ${cacheId}, cacheKey: ${key})`)
  } catch (error) {
    if (error instanceof Error) core.warning(error.message)
  }

  return cacheId
}

async function tryRestoreFromCache(paths: string[], primaryKey: string): Promise<[boolean, string] | [boolean, undefined]> {
  let cacheHitKey: string | undefined = undefined
  let restoredFromCache = false
  try {
    cacheHitKey = await cache.restoreCache(paths, primaryKey)
    if (cacheHitKey !== undefined) {
      restoredFromCache = true
      core.info(`${TOOL_NAME} restored from cache: ${cacheHitKey}`)
    } else {
      core.warning(`Cache for ${TOOL_NAME} not found`)
    }
  } catch (error) {
    if (error instanceof Error) core.warning(error.message)
  }

  return [restoredFromCache, cacheHitKey]
}

async function getDownloadUrl(releaseMetadata: any): Promise<[URL, string]> {
  let platform: string = process.platform // https://nodejs.org/api/process.html#processplatform
  const arch: string = process.arch // https://nodejs.org/api/process.html#processarch

  if (arch !== 'x64') {
    core.setFailed(new Error(`Unsupported architecture: ${arch}`))
    process.exit()
  }

  if (platform === 'win32') {
    platform = 'win'
  } else if (platform === 'darwin') {
    platform = 'osx'
  } else if (platform === 'linux') {
    // do nothing
  } else {
    core.setFailed(new Error(`Unsupported platform: ${platform}`))
    process.exit()
  }

  const downloadUrl = new URL(releaseMetadata.files[`${platform}-${arch}`].url)
  const filename = downloadUrl.pathname.split('/').slice(1).at(-1) || ''
  return [downloadUrl, filename]
}

async function getReleaseMetadata(releaseVersion: string): Promise<any> {
  let releaseMetadata = {}
  core.info(`Fetching release metadata for version: ${releaseVersion}`)
  const response = await fetch(TOOL_RELEASE_METADATA)
  const remoteVersionDefinitions = await response.json()
  if (Array.isArray(remoteVersionDefinitions) && remoteVersionDefinitions.length) {
    if (/([\d])+.([\d])+.([\d]+)/.test(releaseVersion)) {
      releaseMetadata = remoteVersionDefinitions.find(versionDefinition => (versionDefinition === null || versionDefinition === void 0 ? void 0 : versionDefinition.buildId) === releaseVersion)
    } else {
      releaseMetadata = remoteVersionDefinitions.find(versionDefinition => (versionDefinition === null || versionDefinition === void 0 ? void 0 : versionDefinition.version) === releaseVersion)
    }
  } else {
    core.setFailed(new Error(`Could not fetch release metadata from ${TOOL_RELEASE_METADATA}`))
    process.exit()
  }
  return releaseMetadata
}
