import { rmSync, existsSync } from 'fs'
import { resolve, join } from 'path'
import { fileURLToPath } from 'url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const webDir = resolve(__dirname, '../../')
for (const name of ['index.html', 'assets']) {
  const target = join(webDir, name)
  if (existsSync(target)) rmSync(target, { recursive: true, force: true })
}
