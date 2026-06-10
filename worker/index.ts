import { handleRequest } from './api'

export { BoardRoom } from './board-room'

export default {
  fetch: (request, env) => handleRequest(request, env),
} satisfies ExportedHandler<Env>
