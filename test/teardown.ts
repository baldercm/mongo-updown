import { execFileSync } from 'node:child_process'

execFileSync('docker', ['compose', 'down'], { stdio: 'inherit' })
