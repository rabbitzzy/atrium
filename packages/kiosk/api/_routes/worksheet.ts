/**
 * The worksheet service, as a sub-app of the kiosk's API.
 *
 * It used to run on the kiosk machine, because making a Card meant launching
 * headless Chromium and the paper came out of a printer on that LAN. It returns
 * HTML now and the browser prints it, so nothing about it has to be local any
 * more — and a service nobody has to start is a station that cannot be
 * misconfigured by forgetting to.
 *
 * Mounted rather than adapted, being a Hono app already, exactly like
 * skill-graph beside it.
 *
 * The `useSkillGraph` call is what keeps the two halves from talking over the
 * public internet. `blueprint.ts` asks skill-graph for the Room, registers the
 * task and spends the Leaf; skill-graph is mounted in this same function, so
 * those go straight into it — no round trip, no per-deployment URL to get
 * wrong, and no 302 from Deployment Protection answering the deployment's own
 * request with a login page.
 */

import app from '@atrium/worksheet-print/app'
import { useSkillGraph } from '@atrium/worksheet-print/blueprint'
import { callSkillGraph } from '../_lib/skill-graph.js'

useSkillGraph(callSkillGraph)

export default app
