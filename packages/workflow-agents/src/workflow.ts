/**
 * Workflow service entry point.
 *
 * Auto-discovers workflows from `src/workflows/`, importing each so its
 * top-level `task()` calls (the root workflow task + one per shared agent)
 * register with the Render SDK. No web server, no store — just task registration.
 */
import { loadWorkflows } from "./workflows/loader.js";

await loadWorkflows(new URL("./workflows", import.meta.url).pathname);
