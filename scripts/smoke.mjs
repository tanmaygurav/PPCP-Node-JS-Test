import { pathToFileURL } from 'node:url';
import { apiClient, check, createReport, fixture, liveConfig, loadTestEnv, parseArgs, png } from '../test-tools/runtime.mjs';

export async function smoke(options, config) {
  const log = createReport('api-smoke', options, config), api = apiClient(config);
  try {
    await log.step('M01-L01', 'Node liveness and unlock', async () => {
      check((await api.call('/health')).ok === true, 'Health response was not healthy.');
      await api.call('/session', { accessKey: config.key });
    });
    await log.step('M01-L02', 'Expected Google Sheet and Media folder', async () => {
      const result = await api.call('/checks');
      check(result.spreadsheet === config.baseline.expectedSpreadsheetName && result.folder === config.baseline.expectedFolderName, 'Resource names do not match M01. Check the target configuration before writing.');
    });
    const domains = await log.step('M01-L03', 'Active domains and list retrieval', async () => {
      const result = await api.call('/domains');
      check(Array.isArray(result.domains) && result.domains.length > 0, 'Add an active domain in Calculations!C2:C.');
      check(Array.isArray((await api.call('/submissions?limit=1')).items), 'Expected a submission list.');
      return result.domains;
    });
    if (options.write) {
      const runId = log.report.runId;
      const files = ['a', 'b'].map(letter => ({ name: `ppcp-${runId}-${letter}.png`, size: png.length }));
      const plan = await log.step('M01-L04', 'Two resumable uploads complete', async () => {
        const plan = await api.call('/upload-sessions', { files });
        log.report.artifacts.submissionId = plan.submissionId;
        log.report.artifacts.files = plan.uploads.map(upload => ({ id: upload.id, name: upload.name, completed: false })); log.persist();
        for (const upload of plan.uploads) {
          const response = await fetch(upload.uploadUrl, { method: 'PUT', signal: AbortSignal.timeout(60_000),
            headers: { Origin: config.origin, 'Content-Type': upload.mimeType, 'Content-Range': `bytes 0-${png.length - 1}/${png.length}` }, body: png });
          check(response.ok, `Drive upload returned HTTP ${response.status}. Inspect manifest before retrying.`);
          log.report.artifacts.files.find(file => file.id === upload.id).completed = true; log.persist();
        }
        return plan;
      });
      const body = { ...fixture, title: `${fixture.title} ${runId}`, description: `${fixture.description}\nRun: ${runId}`, domain: domains[0], ticket: plan.ticket };
      await log.step('M01-L05', 'Save and read back complete submission', async () => {
        check((await api.call('/submissions', body)).item.id === plan.submissionId, 'Saved ID differs from upload plan.');
        const result = await api.call(`/submissions/${plan.submissionId}`);
        check(result.item.description === body.description && result.item.media.length === 2, 'Submission readback differs from fixture.');
        check(result.item.media.every(file => plan.uploads.some(upload => upload.id === file.fileId)), 'Readback file IDs do not match this run.');
      });
      await log.step('M01-L06', 'Sequential retry returns same record', async () => {
        const retry = await api.call('/submissions', body);
        check(retry.alreadySaved === true && retry.item.id === plan.submissionId, 'Retry did not reuse the saved record.');
      });
      await log.step('M01-L07', 'Remark write and readback', async () => {
        const remark = `Synthetic regression feedback ${runId}`;
        log.report.artifacts.remark = { submissionId: plan.submissionId, text: remark }; log.persist();
        await api.call(`/submissions/${plan.submissionId}/remarks`, { remark });
        check((await api.call(`/submissions/${plan.submissionId}/remarks`)).items.some(item => item.remark === remark), 'Remark readback failed.');
      });
    }
    log.finish(true); return log.report;
  } catch (error) { log.finish(false); throw error; }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { loadTestEnv(); const options = parseArgs(); await smoke(options, liveConfig(options)); }
  catch (error) { console.error(error.safeMessage || 'Live test failed. See the last run report; raw errors are suppressed.'); process.exitCode = 1; }
}
