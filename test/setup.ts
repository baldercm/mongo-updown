import { execFileSync } from 'node:child_process'

execFileSync('docker', ['compose', 'up', '--detach', '--wait'], { stdio: 'inherit' })
