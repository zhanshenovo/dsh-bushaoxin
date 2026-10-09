/** 复现脚本：用真实 apply + 假 cordis context，把每一步的实际入参打出来。 */
import { apply } from '../lib/index.js'

const routes = new Map()
const host = {
  logger: { warn: (m) => console.log('WARN', m) },
  effect(cb) { const d = cb(); return typeof d === 'function' ? d : () => {} },
  webServer: { register(route) { routes.set(route.path, route); return () => routes.delete(route.path) } },
  tools: { register(def) { console.log('registered tool:', def.name); return () => {} } },
  commands: { register(def) { console.log('registered command:', def.name); return () => {} } },
}

const listeners = new Map()
const ctx = {
  inject(services, cb) { console.log('inject:', services); cb(host) },
  on(event, listener) {
    const list = listeners.get(event) ?? []
    list.push(listener)
    listeners.set(event, list)
    console.log('on:', event)
    return () => {}
  },
}

process.env.BUSHAOXIN_DEBUG = '1'
apply(ctx, { dshHome: process.env.DSH_HOME })

const SESSION = 'session-selftest'
console.log('listener count =', (listeners.get('tools/execute') ?? []).length)

for (const listener of listeners.get('tools/execute') ?? []) {
  listener({ name: 'read', arguments: { file_path: 'a' }, agent: { id: SESSION } }, () => Promise.resolve({}))
}

const url = `/dsh-bushaoxin/heartbeat?session=${SESSION}`
console.log('will call with url =', url)

const response = { writeHead() {}, end(chunk) { if (chunk) this.body = (this.body ?? '') + chunk } }
const handler = routes.get('/dsh-bushaoxin/heartbeat').handler
console.log('handler arity =', handler.length)
await handler({ method: 'GET', url }, response)
console.log('body =', response.body)
